/**
 * @fileoverview Description of file, its uses and information
 * about its dependencies.
 */

'use strict';

const LOG = false;

const MODULE_NAME = `layerTree`;

const SQL_QUERY_LIMIT = 500;

const TABLE_VIEW_FORM_CONTAINER_ID = 'vector-layer-table-view-form';

const TABLE_VIEW_CONTAINER_ID = 'vector-layer-table-view-dialog';

var meta, layers, sqlQuery, switchLayer, cloud, legend, state, backboneEvents;

var automaticStartup = true;

var layerTreeOrder = false;

var onEachFeature = [];

var pointToLayer = [];

var onLoad = [];

var onSelect = [];

var onMouseOver = [];

var cm = [];

var styles = [];

var stores = [];

var tableViewStores = {};

var tables = {};

var activeOpenedTable = false;

var _self;

var defaultTemplate = `<div class="cartodb-popup-content">
<div class="form-group gc2-edit-tools" style="visibility: hidden">
    {{#_vidi_content.fields}}
        {{#title}}<h4>{{title}}</h4>{{/title}}
        {{#value}}
        <p {{#type}}class="{{ type }}"{{/type}}>{{{ value }}}</p>
        {{/value}}
        {{^value}}
        <p class="empty">null</p>
        {{/value}}
    {{/_vidi_content.fields}}
</div>`;

/**
 * Layer filters
 */
var React = require('react');
var ReactDOM = require('react-dom');

import LayerFilter from './LayerFilter';
import { relative } from 'path';
import { validateFilters, EXPRESSIONS_FOR_STRINGS, EXPRESSIONS_FOR_NUMBERS, EXPRESSIONS_FOR_DATES, EXPRESSIONS_FOR_BOOLEANS } from './filterUtils';

/**
 *
 * @type {*|exports|module.exports}
 */
let urlparser = require('./../urlparser');

/**
 *
 * @type {*|exports|module.exports}
 */
let MarkupGenerator = require('./MarkupGenerator');
let markupGeneratorInstance = new MarkupGenerator();

/**
 *
 * @type {*|exports|module.exports}
 */

let LayerSorting = require('./LayerSorting');
let layerSortingInstance = new LayerSorting();

/**
 *
 * @type {*|exports|module.exports}
 */
let queueStatistsics = false;
let QueueStatisticsWatcher = require('./QueueStatisticsWatcher');

/**
 * @type {string}
 */
var db = urlparser.db;

/**
 *
 * @type {*|exports|module.exports}
 */
let APIBridgeSingletone = require('./../api-bridge');

/**
 *
 * @type {APIBridge}
 */
var apiBridgeInstance = false;

/**
 * Specifies if layer tree is ready
 */
let layerTreeIsReady = false;

/**
 * Fires when the layer tree is built
 */
let _onReady = false;

/**
 * Keeps track of changed layers
 */

const tileLayerIcon = `<i class="material-icons">border_all</i>`;

const vectorLayerIcon = `<i class="material-icons">gesture</i>`;

let layerTreeWasBuilt = false;

let editingIsEnabled = false;

let treeIsBeingBuilt = false;

let userPreferredForceOfflineMode = -1;

let vectorFilters = {};

/**
 *
 * @type {{set: module.exports.set, init: module.exports.init}}
 */
module.exports = {
    set: function (o) {
        cloud = o.cloud;
        meta = o.meta;
        layers = o.layers;
        legend = o.legend;
        state = o.state;
        sqlQuery = o.sqlQuery;
        switchLayer = o.switchLayer;
        backboneEvents = o.backboneEvents;
        return this;
    },

    init: function () {
        _self = this;
        queueStatistsics = new QueueStatisticsWatcher({ switchLayer, layerTree: _self });
        apiBridgeInstance = APIBridgeSingletone((statistics, forceLayerUpdate) => {
            _self.statisticsHandler(statistics, forceLayerUpdate);
        });

        state.listenTo('layerTree', _self);

        $(`#` + TABLE_VIEW_CONTAINER_ID).find(".expand-less").on("click", function () {
            $("#" + TABLE_VIEW_CONTAINER_ID).animate({
                bottom: (($("#" + TABLE_VIEW_CONTAINER_ID).height()*-1)+30) + "px"
            }, 500, function () {
                $(`#` + TABLE_VIEW_CONTAINER_ID).find(".expand-less").hide();
                $(`#` + TABLE_VIEW_CONTAINER_ID).find(".expand-more").show();
            });
        });

        $(`#` + TABLE_VIEW_CONTAINER_ID).find(".expand-more").on("click", function () {
            $("#" + TABLE_VIEW_CONTAINER_ID).animate({
                bottom: "0"
            }, 500, function () {
                $(`#` + TABLE_VIEW_CONTAINER_ID).find(".expand-less").show();
                $(`#` + TABLE_VIEW_CONTAINER_ID).find(".expand-more").hide();
            });
        });

        $(`#` + TABLE_VIEW_CONTAINER_ID).find(".close-hide").on("click", function () {
            tables[activeOpenedTable].object.trigger(`clearSelection_${tables[activeOpenedTable].uid}`);
            tables[activeOpenedTable].destroy();

            activeOpenedTable = false;

            $("#" + TABLE_VIEW_CONTAINER_ID).animate({
                bottom: "-100%"
            }, 500, function () {
                $(`#` + TABLE_VIEW_CONTAINER_ID).find(".expand-less").show();
                $(`#` + TABLE_VIEW_CONTAINER_ID).find(".expand-more").hide();
            });
        });
    },

    statisticsHandler: (statistics, forceLayerUpdate, skipLastStatisticsCheck) => {
        if (layerTreeWasBuilt === false || _self.isReady() == false) {
            return;
        } else {
            queueStatistsics.processStatisticsUpdate(statistics, forceLayerUpdate, skipLastStatisticsCheck, userPreferredForceOfflineMode, apiBridgeInstance);
        }
    },

    postInit: () => {
        if (layerTreeWasBuilt === false && automaticStartup) {
            _self.create();
        }
    },

    setSelectorValue: (name, type) => {
        let el = $('*[data-gc2-id="' + name.replace('v:', '') + '"]');
        if (type === 'tile') {
            el.data('gc2-layer-type', 'tile');
            el.closest('.layer-item').find('.js-dropdown-label').first().html(tileLayerIcon);
        } else if (type === 'vector') {
            el.data('gc2-layer-type', 'vector');
            el.closest('.layer-item').find('.js-dropdown-label').first().html(vectorLayerIcon);
        } else {
            throw new Error('Invalid type was provided');
        }
    },


    /**
     * Returns layers order in corresponding groups
     * 
     * @return {Promise}
     */
    getLayersOrder: () => {
        let result = new Promise((resolve, reject) => {
            state.getModuleState(MODULE_NAME).then(initialState => {
                let order = ((initialState && `order` in initialState) ? initialState.order : false);
                resolve(order);
            });
        });

        return result;
    },

    /**
     * Returns last available layers order
     * 
     * @return {Promise}
     */
    getLatestLayersOrder: () => {
        return layerTreeOrder;
    },

    isReady: () => {
        return layerTreeIsReady;
    },

    _createToggleOfflineModeControl() {
        let toggleOfllineOnlineMode = $(markupGeneratorInstance.getToggleOfflineModeSelectorDisabled());
        if (`serviceWorker` in navigator) {
            toggleOfllineOnlineMode = $(markupGeneratorInstance.getToggleOfflineModeSelectorEnabled());

            if (apiBridgeInstance.offlineModeIsEnforced()) {
                $(toggleOfllineOnlineMode).find('.js-toggle-offline-mode').prop('checked', true);
            }

            $(toggleOfllineOnlineMode).find('.js-toggle-offline-mode').change(event => {
                if ($(event.target).is(':checked')) {
                    apiBridgeInstance.setOfflineMode(true);
                } else {
                    apiBridgeInstance.setOfflineMode(false);
                }

                userPreferredForceOfflineMode = $(event.target).is(':checked');
            });
        }

        return toggleOfllineOnlineMode;
    },

    /**
     * Creating request for building the tree.
     * In order to avoid race condition as simultaneous calling of run() the pending create()
     * requests are performed one by one.
     */
    create: (forcedState = false, createdByEditor = false) => {
        if (LOG) console.log(`${MODULE_NAME}: create`, treeIsBeingBuilt, forcedState, createdByEditor);

        queueStatistsics.setLastStatistics(false);

        if (editingIsEnabled === false && createdByEditor) {
            editingIsEnabled = true;
        }

        let result = false;
        if (treeIsBeingBuilt) {
            result = new Promise((resolve, reject) => {
                resolve();
            });
        } else {
            layerTreeWasBuilt = true;
            treeIsBeingBuilt = true;
            result = new Promise((resolve, reject) => {
                if (LOG) console.log(`${MODULE_NAME}: started building the tree`);

                /*
                    Some layers are already shown, so they need to be checked in order
                    to stay in tune with the map. Those are different from the activeLayers,
                    which are defined externally via forcedState only.
                */
                let precheckedLayers = layers.getMapLayers();

                layerTreeIsReady = false;
                if (forcedState) {
                    if (LOG) console.log(`${MODULE_NAME}: disabling active layers`, _self.getActiveLayers());
                    _self.getActiveLayers().map(item => {
                        switchLayer.init(item, false, true, false);
                    });
                }

                // Emptying the tree
                $("#layers").empty();

                _self.getLayersOrder().then(order => {

                    try {


                    let activeLayers = [];
                    if (forcedState) {
                        order = forcedState.order;
                        if (`activeLayers` in forcedState) {
                            activeLayers = forcedState.activeLayers;
                        }

                        let layersThatAreNotInMeta = [];
                        let existingMeta = meta.getMetaData();
                        if (`data` in existingMeta) {
                            activeLayers.map(layerName => {
                                let correspondingMeta = meta.getMetaByKey(layerName.replace(`v:`, ``), false);
                                if (correspondingMeta === false) {
                                    layersThatAreNotInMeta.push(layerName.replace(`v:`, ``));
                                }
                            });
                        }

                        if (LOG) console.log(`${MODULE_NAME}: layers that are not in meta`, layersThatAreNotInMeta);

                        if (layersThatAreNotInMeta.length > 0) {
                            let layerFeatchPromises = [];
                            layersThatAreNotInMeta.map(item => {
                                layerFeatchPromises.push(switchLayer.init(item, true));
                            });

                            Promise.all(layerFeatchPromises).then(() => {
                                backboneEvents.get().trigger(`${MODULE_NAME}:activeLayersChange`);
                            });
                        }
                    }

                    layerTreeOrder = order;

                    var base64GroupName, groups, metaData, i, l, count;

                    if (editingIsEnabled) {
                        let toggleOfllineOnlineMode = _self._createToggleOfflineModeControl();
                        if (toggleOfllineOnlineMode) {
                            $("#layers").append(toggleOfllineOnlineMode);
                        }
                    }

                    groups = [];

                    // Getting set of all loaded vectors
                    metaData = meta.getMetaData();
                    for (i = 0; i < metaData.data.length; ++i) {
                        groups[i] = metaData.data[i].layergroup;
                    }

                    let notSortedGroupsArray = array_unique(groups.reverse());
                    metaData.data.reverse();

                    let arr = notSortedGroupsArray;
                    if (order) {
                        arr = layerSortingInstance.sortGroups(order, notSortedGroupsArray);
                    }

                    $("#layers").append(`<div id="layers_list"></div>`);
                    // Filling up groups and underlying layers (except ungrouped ones)
                    for (i = 0; i < arr.length; ++i) {
                        if (arr[i] && arr[i] !== "<font color='red'>[Ungrouped]</font>") {
                            let numberOfActiveLayers = 0;
                            l = [];
                            base64GroupName = Base64.encode(arr[i]).replace(/=/g, "");

                            // Add group container
                            // Only if container doesn't exist
                            // ===============================
                            if ($("#layer-panel-" + base64GroupName).length === 0) {
                                $("#layers_list").append(markupGeneratorInstance.getGroupPanel(base64GroupName, arr[i]));

                                // Append to inner group container
                                // ===============================
                                $("#group-" + base64GroupName).append(`<div id="collapse${base64GroupName}" class="accordion-body collapse"></div>`);
                            }

                            // Get layers that belong to the current layer group
                            let notSortedLayersForCurrentGroup = [];
                            for (let u = 0; u < metaData.data.length; ++u) {
                                if (metaData.data[u].layergroup == arr[i]) {
                                    notSortedLayersForCurrentGroup.push(metaData.data[u]);
                                }
                            }

                            let layersForCurrentGroup = layerSortingInstance.sortLayers(order, notSortedLayersForCurrentGroup, arr[i]);

                            // Add layers
                            // ==========
                            for (var u = 0; u < layersForCurrentGroup.length; ++u) {
                                let localLayer = layersForCurrentGroup[u];

                                let layerIsActive = false;
                                let activeLayerName = false;
                                // If activeLayers are set, then no need to sync with the map
                                if (!forcedState) {
                                    if (precheckedLayers && Array.isArray(precheckedLayers)) {
                                        precheckedLayers.map(item => {
                                            if (item.id && item.id === `${localLayer.f_table_schema}.${localLayer.f_table_name}`
                                                || item.id && item.id === `v:${localLayer.f_table_schema}.${localLayer.f_table_name}`) {
                                                layerIsActive = true;
                                                activeLayerName = item.id;
                                                numberOfActiveLayers++;
                                            }
                                        });
                                    }
                                }

                                _self.createLayerRecord(localLayer, forcedState, precheckedLayers, base64GroupName, layerIsActive, activeLayerName);
                                l.push({});
                            }

                            $("#collapse" + base64GroupName).sortable({
                                axis: 'y',
                                stop: (event, ui) => {
                                    _self.calculateOrder();
                                    backboneEvents.get().trigger(`${MODULE_NAME}:sorted`);
                                    layers.reorderLayers();
                                }
                            });
                            
                            if (!isNaN(parseInt($($("#layer-panel-" + base64GroupName + " .layer-count span")[1]).html()))) {
                                count = parseInt($($("#layer-panel-" + base64GroupName + " .layer-count span")[1]).html()) + l.length;
                            } else {
                                count = l.length;
                            }

                            $("#layer-panel-" + base64GroupName + " span:eq(1)").html(count);
                            // Remove the group if empty
                            if (l.length === 0) {
                                $("#layer-panel-" + base64GroupName).remove();
                            }

                            if (numberOfActiveLayers > 0) {
                                $("#layer-panel-" + base64GroupName + " span:eq(0)").html(numberOfActiveLayers);
                            }
                        }
                    }

                    $(`#layers_list`).sortable({
                        axis: 'y',
                        stop: (event, ui) => {
                            _self.calculateOrder();
                            backboneEvents.get().trigger(`${MODULE_NAME}:sorted`);
                            layers.reorderLayers();
                        }
                    });

                    if (queueStatistsics.getLastStatistics()) {
                        _self.statisticsHandler(queueStatistsics.getLastStatistics(), false, true);
                    }

                    layers.reorderLayers();
                    state.listen(MODULE_NAME, `sorted`);
                    state.listen(MODULE_NAME, `activeLayersChange`);
                    state.listen(MODULE_NAME, `filtersChange`);
                    
                    backboneEvents.get().trigger(`${MODULE_NAME}:sorted`);
                    setTimeout(() => {
                        if (LOG) console.log(`${MODULE_NAME}: active layers`, activeLayers);

                        if (activeLayers) {   
                            activeLayers.map(layerName => {
                                if ($(`[data-gc2-layer-key="${layerName.replace('v:', '')}.the_geom"]`).find(`.js-layer-type-selector-tile`).length === 1 &&
                                    $(`[data-gc2-layer-key="${layerName.replace('v:', '')}.the_geom"]`).find(`.js-layer-type-selector-vector`).length === 1) {
                                    if (layerName.indexOf(`v:`) === 0) {
                                        $(`[data-gc2-layer-key="${layerName.replace('v:', '')}.the_geom"]`).find(`.js-layer-type-selector-vector`).trigger(`click`, [{doNotLegend: true}]);
                                    } else {
                                        $(`[data-gc2-layer-key="${layerName.replace('v:', '')}.the_geom"]`).find(`.js-layer-type-selector-tile`).trigger(`click`, [{doNotLegend: true}]);
                                    }
                                } else {
                                    $(`#layers`).find(`input[data-gc2-id="${layerName.replace('v:', '')}"]`).trigger('click', [{doNotLegend: true}]);
                                }
                            });

                            legend.init();
                        }

                        layerTreeIsReady = true;
                        treeIsBeingBuilt = false;
                        backboneEvents.get().trigger(`${MODULE_NAME}:ready`);
                        backboneEvents.get().trigger(`${MODULE_NAME}:activeLayersChange`);

                        if (LOG) console.log(`${MODULE_NAME}: finished building the tree`);

                        resolve();
                    }, 1000);


                }catch(e) {
                    console.log(e);
                }


                });
            });
        }

        return result;
    },


    /**
     * Creates SQL store for vector layers
     * 
     * @param {Object} layer Layer description
     * 
     * @return {void}
     */
    createStore: (layer) => {
        let layerKey = layer.f_table_schema + '.' + layer.f_table_name;

        let whereClause = false;
        if (layerKey in vectorFilters) {
            let conditions = _self.getFilterConditions(layerKey);
            if (conditions.length > 0) {
                if (vectorFilters[layerKey].match === `any`) {
                    whereClause = conditions.join(` OR `);
                } else if (vectorFilters[layerKey].match === `all`) {
                    whereClause = conditions.join(` AND `);
                } else {
                    throw new Error(`Invalid match type value`);
                }
            }

            $(`[data-gc2-layer-key="${layerKey + `.` + layer.f_geometry_column}"]`).find(`.js-toggle-filters-number-of-filters`).text(conditions.length);
        }

        let sql = `SELECT * FROM ${layerKey} LIMIT ${SQL_QUERY_LIMIT}`;
        if (whereClause) sql = `SELECT * FROM ${layerKey} WHERE (${whereClause}) LIMIT ${SQL_QUERY_LIMIT}`;

        stores['v:' + layerKey] = new geocloud.sqlStore({
            jsonp: false,
            method: "POST",
            host: "",
            db: db,
            uri: "/api/sql",
            clickable: true,
            id: 'v:' + layerKey,
            name: 'v:' + layerKey,
            lifetime: 0,
            styleMap: styles['v:' + layerKey],
            sql: sql,
            onLoad: (l) => {
                if (l === undefined) return;

                let tableId = `table_view_${layerKey.replace(`.`, `_`)}`;
                if ($(`#${tableId}_container`).length > 0) $(`#${tableId}_container`).remove();
                $(`#` + TABLE_VIEW_FORM_CONTAINER_ID).append(`<div class="js-table-view-container" id="${tableId}_container">
                    <table id="${tableId}"></table>
                </div>`);
                var defaultTemplate = `<div class="cartodb-popup-content">
                <div class="form-group gc2-edit-tools" style="visibility: hidden">
                    {{#_vidi_content.fields}}
                        {{#title}}<h4>{{title}}</h4>{{/title}}
                        {{#value}}
                        <p {{#type}}class="{{ type }}"{{/type}}>{{{ value }}}</p>
                        {{/value}}
                        {{^value}}
                        <p class="empty">null</p>
                        {{/value}}
                    {{/_vidi_content.fields}}
                </div>`;

                let metaDataKeys = meta.getMetaDataKeys();
                let template = (typeof metaDataKeys[layerKey].infowindow !== "undefined"
                    && metaDataKeys[layerKey].infowindow.template !== "")
                    ? metaDataKeys[layerKey].infowindow.template : defaultTemplate;
                let tableHeaders = sqlQuery.prepareDataForTableView(`v:` + layerKey, l.geoJSON.features);

                let localTable = gc2table.init({
                    el: `#` + tableId,
                    geocloud2: cloud.get(),
                    store: stores[`v:` + layerKey],
                    cm: tableHeaders,
                    autoUpdate: false,
                    autoPan: false,
                    openPopUp: true,
                    setViewOnSelect: true,
                    responsive: false,
                    callCustomOnload: true,
                    assignFeatureEventListenersOnDataLoad: false,
                    height: 400,
                    locale: window._vidiLocale.replace("_", "-"),
                    template: template,
                    usingCartodb: false
                });

                localTable.loadDataInTable(true);

                tables[`v:` + layerKey] = localTable;

                $('*[data-gc2-id-vec="' + l.id + '"]').parent().siblings().children().removeClass("fa-spin");

                layers.decrementCountLoading(l.id);
                backboneEvents.get().trigger("doneLoading:layers", l.id);
            },
            transformResponse: (response, id) => {
                return apiBridgeInstance.transformResponseHandler(response, id);
            },
            onEachFeature: (feature, layer) => {
                onEachFeature['v:' + layerKey](feature, layer);
            }
        });
    },

    /**
     * Extracts valid conditions for specified layer
     * 
     * @param {String} layerKey Vector layer identifier
     */
    getFilterConditions(layerKey) {
        let layer = meta.getMetaByKey(layerKey);

        let conditions = [];
        if (layerKey in vectorFilters) {
            vectorFilters[layerKey].columns.map((column, index) => {
                if (column.fieldname && column.value) {
                    for (let key in layer.fields) {
                        if (key === column.fieldname) {
                            switch (layer.fields[key].type) {
                                case `boolean`:
                                    if (EXPRESSIONS_FOR_BOOLEANS.indexOf(column.expression) === -1) {
                                        throw new Error(`Unable to apply ${column.expression} expression to ${column.fieldname} (${layer.fields[key].type} type)`);
                                    }

                                    let value = `NULL`;
                                    if (column.value === `true`) value = `TRUE`;
                                    if (column.value === `false`) value = `FALSE`;

                                    conditions.push(`${column.fieldname} ${column.expression} ${value}`);
                                    break;
                                case `date`:
                                    if (EXPRESSIONS_FOR_DATES.indexOf(column.expression) === -1) {
                                        throw new Error(`Unable to apply ${column.expression} expression to ${column.fieldname} (${layer.fields[key].type} type)`);
                                    }

                                    conditions.push(`${column.fieldname} ${column.expression} '${column.value}'`);
                                    break;
                                case `string`:
                                case `character varying`:
                                    if (EXPRESSIONS_FOR_STRINGS.indexOf(column.expression) === -1) {
                                        throw new Error(`Unable to apply ${column.expression} expression to ${column.fieldname} (${layer.fields[key].type} type)`);
                                    }

                                    if (column.expression === 'like') {
                                        conditions.push(`${column.fieldname} ${column.expression} '%${column.value}%'`);
                                    } else {
                                        conditions.push(`${column.fieldname} ${column.expression} '${column.value}'`);
                                    }
                                    
                                    break;
                                case `integer`:
                                case `double precision`:
                                    if (EXPRESSIONS_FOR_NUMBERS.indexOf(column.expression) === -1) {
                                        throw new Error(`Unable to apply ${column.expression} expression to ${column.fieldname} (${layer.fields[key].type} type)`);
                                    }

                                    conditions.push(`${column.fieldname} ${column.expression} ${column.value}`);
                                    break;
                                default:
                                    console.error(`Unable to process filter with type '${layer.fields[key].type}'`);
                            }
                        }
                    }
                }
            });
        }

        return conditions;
    },

    /**
     * Generates separate layer control record
     * 
     * @returns {void}
     */
    createLayerRecord: (layer, forcedState, precheckedLayers, base64GroupName, layerIsActive, activeLayerName) => {
        let displayInfo;
        let text = (layer.f_table_title === null || layer.f_table_title === "") ? layer.f_table_name : layer.f_table_title;

        if (layer.baselayer) {
            $("#base-layer-list").append(`<div class='list-group-item'>
                <div class='row-action-primary radio radio-primary base-layer-item' data-gc2-base-id='${layer.f_table_schema}.${layer.f_table_name}'>
                    <label class='baselayer-label'>
                        <input type='radio' name='baselayers'>${text}<span class='fa fa-check' aria-hidden='true'></span>
                    </label>
                </div>
            </div>`);
        } else {
            let layerIsTheTileOne = true;
            let layerIsTheVectorOne = false;
                                        
            let singleTypeLayer = true;
            let selectorLabel = tileLayerIcon;
            let defaultLayerType = 'tile';

            let layerIsEditable = false;
            if (layer && layer.meta) {
                let parsedMeta = JSON.parse(layer.meta);
                if (parsedMeta && typeof parsedMeta === `object`) {
                    if (`vidi_layer_editable` in parsedMeta && parsedMeta.vidi_layer_editable) {
                        layerIsEditable = true;
                    }

                    if (`meta_desc` in parsedMeta) {
                        displayInfo = (parsedMeta.meta_desc || layer.f_table_abstract) ? "visible" : "hidden";
                    }

                    if (`vidi_layer_type` in parsedMeta && ['v', 'tv', 'vt'].indexOf(parsedMeta.vidi_layer_type) !== -1) {
                        layerIsTheVectorOne = true;
                        singleTypeLayer = false;

                        if (parsedMeta.vidi_layer_type === 'v') {
                            defaultLayerType = 'vector';
                            selectorLabel = vectorLayerIcon;
                            singleTypeLayer = true;
                            layerIsTheTileOne = false;
                        }
                    }
                }
            }

            if (layerIsActive) {
                if (activeLayerName.indexOf(`v:`) === 0) {
                    selectorLabel = vectorLayerIcon;
                    defaultLayerType = 'vector';
                }
            }

            let layerKey = layer.f_table_schema + "." + layer.f_table_name;
            let layerKeyWithGeom = layerKey + "." + layer.f_geometry_column;

            if (layerIsTheVectorOne) {
                _self.createStore(layer);
            }

            let lockedLayer = (layer.authentication === "Read/write" ? " <i class=\"fa fa-lock gc2-session-lock\" aria-hidden=\"true\"></i>" : "");

            let layerTypeSelector = false;
            if (singleTypeLayer) {
                if (layerIsTheTileOne) {
                    layerTypeSelector = `<div style="display: inline-block; vertical-align: middle;">
                        ${tileLayerIcon}
                    </div>`;
                } else if (layerIsTheVectorOne) {
                    layerTypeSelector = `<div style="display: inline-block; vertical-align: middle;">
                        ${vectorLayerIcon}
                    </div>`;
                }
            } else {
                layerTypeSelector = markupGeneratorInstance.getLayerTypeSelector(selectorLabel, tileLayerIcon, vectorLayerIcon);
            }

            let addButton = ``;
            if (editingIsEnabled && layerIsEditable) {
                addButton = markupGeneratorInstance.getAddButton(layerKeyWithGeom);
            }

            let layerControlRecord = $(markupGeneratorInstance.getLayerControlRecord(layerKeyWithGeom, layerKey, layerIsActive,
                layer, defaultLayerType, layerTypeSelector, text, lockedLayer, addButton, displayInfo));

            $(layerControlRecord).find('.js-layer-type-selector-tile').first().on('click', (e, data) => {
                let switcher = $(e.target).closest('.layer-item').find('.js-show-layer-control');
                $(switcher).data('gc2-layer-type', 'tile');
                $(switcher).prop('checked', true);

                $(`[data-gc2-layer-key="${layerKeyWithGeom}"]`).find(`.js-toggle-filters`).hide();
                $(`[data-gc2-layer-key="${layerKeyWithGeom}"]`).find(`.js-toggle-table-view`).hide();

                $(`[data-gc2-layer-key="${layerKeyWithGeom}"]`).find('.js-layer-settings').hide(0);

                _self.reloadLayer($(switcher).data('gc2-id'), false, (data ? data.doNotLegend : false));
                $(e.target).closest('.layer-item').find('.js-dropdown-label').html(tileLayerIcon);
                backboneEvents.get().trigger(`${MODULE_NAME}:activeLayersChange`);
            });

            $(layerControlRecord).find('.js-layer-type-selector-vector').first().on('click', (e, data) => {
                let switcher = $(e.target).closest('.layer-item').find('.js-show-layer-control');
                $(switcher).data('gc2-layer-type', 'vector');
                $(switcher).prop('checked', true);

                $(`[data-gc2-layer-key="${layerKeyWithGeom}"]`).find(`.js-toggle-filters`).show();
                $(`[data-gc2-layer-key="${layerKeyWithGeom}"]`).find(`.js-toggle-table-view`).show();

                _self.reloadLayer('v:' + $(switcher).data('gc2-id'), false, (data ? data.doNotLegend : false));
                $(e.target).closest('.layer-item').find('.js-dropdown-label').html(vectorLayerIcon);
                backboneEvents.get().trigger(`${MODULE_NAME}:activeLayersChange`);
            });

            $("#collapse" + base64GroupName).append(layerControlRecord);

            // Filtering is available only for vector layers
            if (layerIsTheVectorOne) {
                let componentContainerId = `layer-settings-filters-${layerKey}`;
                $(`[data-gc2-layer-key="${layerKeyWithGeom}"]`).find('.js-layer-settings').append(`<div id="${componentContainerId}" style="padding-left: 15px; padding-right: 10px; padding-bottom: 10px;"></div>`);
        
                let conditions = _self.getFilterConditions(layerKey);
                $(`[data-gc2-layer-key="${layerKeyWithGeom}"]`).find(`.js-toggle-filters-number-of-filters`).text(conditions.length);
                let filters = {};
                if (layerKey in vectorFilters) {
                    filters = vectorFilters[layerKey];
                }

                if (document.getElementById(componentContainerId)) {                   
                    ReactDOM.render(<LayerFilter layer={layer} filters={filters} onApply={_self.onApplyFiltersHandler}/>, document.getElementById(componentContainerId));
                    $(`[data-gc2-layer-key="${layerKeyWithGeom}"]`).find('.js-layer-settings').hide(0);
        
                    $(`[data-gc2-layer-key="${layerKeyWithGeom}"]`).find(`.js-toggle-filters`).click(() => {
                        $(`[data-gc2-layer-key="${layerKeyWithGeom}"]`).find('.js-layer-settings').toggle();
                    });
                }

                // Table view
                $(`[data-gc2-layer-key="${layerKeyWithGeom}"]`).find(`.js-toggle-table-view`).click(() => {
                    if (activeOpenedTable) {
                        tables[activeOpenedTable].object.trigger(`clearSelection_${tables[activeOpenedTable].uid}`);
                        tables[activeOpenedTable].destroy();
                    }

                    activeOpenedTable = `v:` + layerKey;
                    tables[activeOpenedTable].assignEventListeners();

                    $(`.js-table-view-container`).hide();
                    $(`.js-table-view-container`).hide();
                    let tableId = `table_view_${layerKey.replace(`.`, `_`)}`;
                    if($(`#${tableId}_container`).length !== 1) throw new Error(`Unable to find the table view container`);
                    $(`#${tableId}_container`).show();

                    $("#" + TABLE_VIEW_CONTAINER_ID).animate({
                        bottom: "0"
                    }, 500, function () {
                        $(".expand-less").show();
                        $(".expand-more").hide();
                    });
                });

                // If vector layer is active, show the filtering option
                if (layerIsActive && defaultLayerType === `vector`) {
                    $(`[data-gc2-layer-key="${layerKeyWithGeom}"]`).find(`.js-toggle-filters`).show();
                    $(`[data-gc2-layer-key="${layerKeyWithGeom}"]`).find(`.js-toggle-table-view`).show();
                } else {
                    $(`[data-gc2-layer-key="${layerKeyWithGeom}"]`).find(`.js-toggle-filters`).hide();
                    $(`[data-gc2-layer-key="${layerKeyWithGeom}"]`).find(`.js-toggle-table-view`).hide();
                }
            } else {
                $(`[data-gc2-layer-key="${layerKeyWithGeom}"]`).find(`.js-toggle-filters`).remove();
                $(`[data-gc2-layer-key="${layerKeyWithGeom}"]`).find(`.js-toggle-table-view`).remove();
            }
        }
    },

    onApplyFiltersHandler: ({ layerKey, filters}) => {
        validateFilters(filters);

        let correspondingLayer = meta.getMetaByKey(layerKey);

        vectorFilters[layerKey] = filters;
        backboneEvents.get().trigger(`${MODULE_NAME}:filtersChange`);

        _self.createStore(correspondingLayer);
        _self.reloadLayer(`v:` + layerKey);
    },

    calculateOrder: () => {
        layerTreeOrder = [];

        $(`[id^="layer-panel-"]`).each((index, element) => {
            let id = $(element).attr(`id`).replace(`layer-panel-`, ``);
            let layers = [];
            $(`#${$(element).attr(`id`)}`).find(`#collapse${id}`).children().each((layerIndex, layerElement) => {
                let layerKey = $(layerElement).data(`gc2-layer-key`);
                let splitLayerKey = layerKey.split('.');
                if (splitLayerKey.length !== 3) {
                    throw new Error(`Invalid layer key (${layerKey})`);
                }

                layers.push({ id: `${splitLayerKey[0]}.${splitLayerKey[1]}` });
            });

            let readableId = atob(id);
            if (readableId) {
                layerTreeOrder.push({ id: readableId, layers });
            } else {
                throw new Error(`Unable to decode the layer group identifier (${id})`);
            }
        });
    },

    /**
     * Returns current module state
     */
    getState: () => {
        let activeLayers = _self.getActiveLayers();
        let state = {
            order: layerTreeOrder,
            vectorFilters,
            activeLayers
        };

        return state;
    },

    /**
     * Applies externally provided state
     */
    applyState: (newState) => {
        // Setting vector filters
        if (newState !== false && `vectorFilters` in newState) {
            for (let key in newState.vectorFilters) {
                validateFilters(newState.vectorFilters[key]);
            }

            vectorFilters = newState.vectorFilters;
        } else {
            vectorFilters = {};
        }

        queueStatistsics.setLastStatistics(false);
        if (newState === false) {
            newState = { order: false };
        } else if (newState.order && newState.order === 'false') {
            newState.order = false;
        }

        return _self.create(newState);
    },

    /**
     * Reloading provided layer.
     * 
     * @param {String} layerId Layer identifier
     */
    reloadLayer: (layerId, forceTileRedraw = false, doNotLegend = false) => {
        switchLayer.init(layerId, false, doNotLegend, forceTileRedraw);
        switchLayer.init(layerId, true, doNotLegend, forceTileRedraw);
    },

    /**
     * Returns list of currently enabled layers
     */
    getActiveLayers: () => {
        let activeLayerIds = [];
        $('*[data-gc2-layer-type]').each((index, item) => {
            let isEnabled = $(item).is(':checked');
            if (isEnabled) {
                if ($(item).data('gc2-layer-type') === 'tile') {
                    activeLayerIds.push($(item).data('gc2-id'));
                } else {
                    activeLayerIds.push('v:' + $(item).data('gc2-id'));
                }
            }
        });

        activeLayerIds = activeLayerIds.filter((v, i, a) => { return a.indexOf(v) === i}); 
        return activeLayerIds;
    },

    setOnEachFeature: function (layer, fn) {
        onEachFeature[layer] = fn;
    },

    setOnLoad: function (layer, fn) {
        onLoad[layer] = fn;
    },

    setOnSelect: function (layer, fn) {
        onSelect[layer] = fn;
    },

    setOnMouseOver: function (layer, fn) {
        onMouseOver[layer] = fn;
    },

    setCM: function (layer, c) {
        cm[layer] = c;
    },

    setStyle: function (layer, s) {
        styles[layer] = s;
    },

    setPointToLayer: function (layer, fn) {
        pointToLayer[layer] = fn;
    },

    setAutomatic: (value) => {
        automaticStartup = value;
    },
    
    getStores: function () {
        return stores;
    },

    load: function (id) {
        stores[id].load();
    }
};