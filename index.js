import 'ol/ol.css';
import { Map, View, Feature } from 'ol';
import { Tile as TileLayer, Vector as VectorLayer } from 'ol/layer';
import { fromLonLat } from 'ol/proj';
import { Style, Stroke } from 'ol/style';
import { OSM, Vector as VectorSource, BingMaps, CartoDB, XYZ } from 'ol/source';
import LineString from 'ol/geom/LineString';
import Papa from 'papaparse';
import $ from 'jquery';
import XLSX from 'xlsx';
import { toJpeg } from 'html-to-image';
import jsPDF from 'jspdf';
var vector = null;
var max = 0;
var raster = new TileLayer({
    source: new OSM({
        url: 'https://maps.wikimedia.org/osm-intl/{z}/{x}/{y}.png'
    })
});

var satellite = new TileLayer({
    source: new XYZ({
        attributions: ['Powered by Esri',
                       'Source: Esri, DigitalGlobe, GeoEye, Earthstar Geographics, CNES/Airbus DS, USDA, USGS, AeroGRID, IGN, and the GIS User Community'],
        attributionsCollapsible: false,
        url: 'https://services.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
        maxZoom: 23
      })
});

const map = new Map({
    target: 'map',
    layers: [satellite],
    controls: [],
    view: new View({
        center: fromLonLat([30.4997161310166, -29.7572306357324]),
        zoom: 4
    })
});
function fitView(map, vector) {
    map.getView().fit(vector.getSource().getExtent(), {
        size: map.getSize(),
        padding: [20, 20, 20, 20]
    });
}
$('#btn-fit').click(() => {
    fitView(map, vector);
});
function splitRoute(coordinates) {
    let routes = [];
    let i = 1;
    while (i < coordinates.length) {
        let [lon, lat] = coordinates[i];
        let [prevLon, prevLat] = coordinates[i - 1];
        let dist = Math.sqrt(
            Math.pow(Math.abs(lon - prevLon), 2) +
                Math.pow(Math.abs(lat - prevLat) > 0.05, 2)
        );
        if (dist > 0.05) {
            let subroute = coordinates.splice(0, i);

            routes.push(subroute);
            i = 0;
        }
        i++;
    }
    routes.push(coordinates);
    return routes;
}
function getRoute(coordinates) {
    let source = new VectorSource({ wrapX: false });
    vector = new VectorLayer({
        source
    });
    let routes = splitRoute(coordinates);
    let features = [];
    let feature,
        featureStyle,
        geometry = null;
    for (let route of routes) {
        feature = new Feature();
        featureStyle = new Style({
            stroke: new Stroke({ color: 'red' })
        });
        feature.setStyle(featureStyle);
        geometry = new LineString(route);
        geometry.transform('EPSG:4326', 'EPSG:3857');
        feature.setGeometry(geometry);
        features.push(feature);
    }
    vector.getSource().addFeatures(features);
    map.addLayer(vector);
    fitView(map, vector);
}
function setCoordinates(file) {
    max = 0;
    $('#status').html('parsing csv file...');
    Papa.parse(file, {
        skipEmptyLines: true,
        header: true,
        dynamicTyping: true,
        complete: results => {
            max = results.data.reduce((prev, curr) => {
                if (curr['Veloctiy (km/h)'] > prev)
                    return curr['Veloctiy (km/h)'];
                return prev;
            }, 0);
            let coordinates = results.data.map(({ Longitude, Latitude }) => {
                return [Longitude, Latitude];
            });
            $('#speed').text(String(max));
            $('#status').html(
                `First reading: ${
                    results.data[0][
                        'Time of reading (South Africa Standard Time)'
                    ]
                } <br> Last reading: ${
                    results.data.pop()[
                        'Time of reading (South Africa Standard Time)'
                    ]
                }`
            );
            getRoute(coordinates);
        }
    });
}
function handleFileSelect(evt) {
    $('#status').html('');
    $('#speed').html('');
    map.removeLayer(vector);
    let file = evt.target.files[0];
    if (file.name.split('.').pop() == 'csv') {
        setCoordinates(file);
        return;
    }
    let reader = new FileReader();
    reader.onload = function(e) {
        var data = new Uint8Array(e.target.result);
        var workbook = XLSX.read(data, { type: 'array' });
        $('#status').html('converting excel to csv...');
        file = XLSX.utils.sheet_to_csv(workbook.Sheets['Data']);
        setCoordinates(file);
        /* DO SOMETHING WITH workbook HERE */
    };
    $('#status').html('parsing excel file...');
    reader.readAsArrayBuffer(file);
}
$(document).ready(() => {
    $('#csv-file').change(handleFileSelect);
});

var exportOptions = {
    filter: function(element) {
        return element.className.indexOf('ol-control') === -1;
    }
};
let exportButton = $('#export');
exportButton.click(() => {
    console.log('click');
    exportButton.disabled = true;
    document.body.style.cursor = 'progress';
    let format = 'A4';
    let resolution = 150;
    let dim = [297, 210];
    let width = Math.round((dim[0] * resolution) / 25.4);
    let height = (height = Math.round((dim[1] * resolution) / 25.4));
    let size = map.getSize();
    var viewResolution = map.getView().getResolution();

    map.once('rendercomplete', () => {
        exportOptions.width = width;
        exportOptions.height = height;
        toJpeg(map.getViewport(), exportOptions).then(dataUrl => {
            var pdf = new jsPDF('landscape', undefined, format);
            pdf.addImage(dataUrl, 'JPEG', 0, 0, dim[0], dim[1]);
            pdf.save('map.pdf');
            map.setSize(size);
            map.getView().setResolution(viewResolution);
            exportButton.disabled = false;
            document.body.style.cursor = 'auto';
        });
    });
    let printSize = [width, height];
    map.setSize(printSize);
    let scaling = Math.min(width / size[0], height / size[1]);
    map.getView().setResolution(viewResolution / scaling);
});
