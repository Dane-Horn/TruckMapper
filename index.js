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
let appId = 'Y786mSiJ1ODtUX2xLrbT';
let appCode = 'e7ipsyDlKHhiHLPhNUO9Sg';
let vector = null;
let max = 0;
let raster = new TileLayer({
    source: new OSM({
        url: 'https://maps.wikimedia.org/osm-intl/{z}/{x}/{y}.png',
    }),
});

let satellite = new TileLayer({
    source: new XYZ({
        url: `https://{1-4}.${'aerial'}.maps.cit.api.here.com/${'maptile'}/2.1/maptile/newest/${'hybrid.day'}/{z}/{x}/{y}/128/png?app_id=${appId}&app_code=${appCode}`,
    }),
});

const map = new Map({
    target: 'map',
    layers: [satellite],
    controls: [],

    view: new View({
        center: fromLonLat([30.4997161310166, -29.7572306357324]),
        zoom: 4,
    }),
});
map.setSize([700, 700]);
function fitView(map, vector) {
    map.getView().fit(vector.getSource().getExtent(), {
        size: map.getSize(),
        padding: [20, 20, 20, 20],
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
        source,
    });
    let routes = splitRoute(coordinates);
    let features = [];
    let feature,
        featureStyle,
        geometry = null;
    for (let route of routes) {
        feature = new Feature();
        featureStyle = new Style({
            stroke: new Stroke({ color: 'rgba(255, 0, 0, 0.5)', width: 2 }),
        });
        feature.setStyle(featureStyle);
        geometry = new LineString(route);
        geometry.transform('EPSG:4326', 'EPSG:3857');
        feature.setGeometry(geometry);
        features.push(feature);
    }
    $('#status').html('Adding route to map...');
    vector.getSource().addFeatures(features);
    map.addLayer(vector);
    console.log(vector.setZIndex(0));
    fitView(map, vector);
    $('#map').width = $('#status').html('Route added!');
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
            $('#speed').text(`Max speed: ${max}km/h`);
            $('#readings').html(
                `From: ${
                    results.data[0][
                        'Time of reading (South Africa Standard Time)'
                    ]
                } <br>To: ${
                    results.data.pop()[
                        'Time of reading (South Africa Standard Time)'
                    ]
                }`
            );
            getRoute(coordinates);
            $('#status').html('File parsed!');
        },
    });
}
function handleFileSelect(evt) {
    $('#readings').html('');
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
        let data = new Uint8Array(e.target.result);
        let workbook = XLSX.read(data, { type: 'array' });
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

let exportOptions = {
    filter: function(element) {
        return element.className.indexOf('ol-control') === -1;
    },
};
let exportButton = $('#export');
exportButton.click(() => {
    exportButton.disabled = true;
    document.body.style.cursor = 'progress';
    let format = 'A4';
    let resolution = $('#dpi-select').val();
    let dim = [297, 210];
    let width = Math.round((dim[0] * resolution) / 25.4);
    let height = (height = Math.round((dim[1] * resolution) / 25.4));
    let size = map.getSize();
    let viewResolution = map.getView().getResolution();

    map.once('rendercomplete', () => {
        $('#status').html('converting map to jpeg...');
        exportOptions.width = width;
        exportOptions.height = height;
        toJpeg(map.getViewport(), exportOptions).then(dataUrl => {
            $('#status').html('creating pdf file...');
            let pdf = new jsPDF('landscape', undefined, format);
            pdf.addImage(dataUrl, 'JPEG', 0, 0, dim[0], dim[1]);
            $('#status').html('downloading pdf file...');
            pdf.save('map.pdf');
            map.setSize(size);
            map.getView().setResolution(viewResolution);
            exportButton.disabled = false;
            document.body.style.cursor = 'auto';
            $('#status').html('');
        });
    });
    $('#status').html('rendering map at desired dpi...');
    fitView(map, vector);
    let printSize = [width, height];
    map.setSize(printSize);
    let scaling = Math.min(width / size[0], height / size[1]);
    map.getView().setResolution(viewResolution / scaling);
});
