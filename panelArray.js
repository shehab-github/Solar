define([
    "dojo/_base/declare",
    "dojo/Stateful",
    "dojo/Evented",
    "dojo/Deferred",
    "esri/graphicsUtils",
    "esri/geometry/Point",
    "esri/geometry/Polygon",
    "esri/graphic",
    "esri/symbols/SimpleFillSymbol",
    "esri/Color",
    "esri/geometry/geometryEngine",
    "esri/SpatialReference",
    "esri/tasks/Geoprocessor",
    "esri/tasks/FeatureSet",
    "esri/geometry/geodesicUtils",
    "esri/geometry/webMercatorUtils"
], function (declare, Stateful, Evented, Deferred, graphicsUtils, Point, Polygon, Graphic, SimpleFillSymbol, Color, geometryEngine, SpatialReference, Geoprocessor, FeatureSet, geodesicUtils, webMercatorUtils) {

    function getPolygons(extent, orientation, width, height, angle, rowSpacing, container) {

        var columnSpacing = 0;

        var reachedX = extent.xmin;
        var reachedY = extent.ymin;
        height = height * Math.cos(angle * Math.PI / 180);

        var rings = [];
        while (reachedX + width < extent.xmax) {

            reachedY = extent.ymin;

            while (reachedY + height < extent.ymax) {
                rings.push([
                    [reachedX, reachedY],
                    [reachedX + width, reachedY],
                    [reachedX + width, reachedY + height],
                    [reachedX, reachedY + height],
                    [reachedX, reachedY]
                ]);
                reachedY += height + rowSpacing;
            }

            reachedX += width + columnSpacing;

        }

        var allPanelsSinglePolygon = new Polygon({
            "rings": rings,
            "spatialReference": extent.spatialReference
        });
        var rotatedPanels = geometryEngine.rotate(allPanelsSinglePolygon, orientation);

        var result = [];

        var include;
        var currentRing;



        for (var i = 0; i < rotatedPanels.rings.length; i++) {
            currentRing = rotatedPanels.rings[i];
            include = true;

            for (var j = 0; j < currentRing.length; j++) {
                include = include && container.contains(new Point(currentRing[j][0], currentRing[j][1], extent.spatialReference));
            }

            if (include) {
                result.push(new Polygon({
                    "rings": [currentRing],
                    "spatialReference": extent.spatialReference
                }));
            }
        }

        return result;

    }

    return declare("panelArray", [Stateful, Evented], {

        /** Whether or not a user has been logged in */
        is_customer: false,

        /** Tariff Type of User */
        tariffType: null,

        /** Annual Usage in KWH of user */
        userAnnualUsage: 0,

        /*------   Panel placement properties    ------*/
        /** Esri polygon representing the roof containing the panels */
        panel_roof: null,

        /** Esri polygon representing the area of the roof containing panels */
        panel_area: null,
        setPanelArea: function (value) {
            if (this.panel_roof) {
                var currentRing = value.rings[0];
                var include = true;
                for (var j = 0; j < currentRing.length; j++) {
                    include = include && (this.panel_roof.contains(new Point(currentRing[j][0], currentRing[j][1], new SpatialReference(102100))) ||
                        (this.panel_roof.rings[0][j][0] == currentRing[j][0] && this.panel_roof.rings[0][j][1] == currentRing[j][1]));
                }
                if (include) {
                    this._changeAttrValue("panel_area", value);
                    this.emit("modified");
                    return 0;
                } else {
                    this._changeAttrValue("panel_area", value);
                    this.set("orientation", 0);
                    this.set("angle", 0);
                    this.emit("modified");
                    return 1;
                }
            } else {
                this._changeAttrValue("panel_area", value);
                this.set("orientation", 0);
                this.set("angle", 0);
                this.emit("modified");
                return 2;
            }
        },

        pointInCurrentArea: function (point) {
            if (this.get("panel_area") == null) {
                return false;
            } else {
                if (this.get("panel_area").contains(point)) {
                    return true;
                } else {
                    return false;
                }
            }
        },

        /** Angle of the panels (degrees from horizontal) */
        angle: 25,
        _angleSetter: function (value) {
            if (value != this.angle) {
                this.angle = value;
                if (this.panel_area) {
                    this.emit("modified");
                }
            }
        },

        /** orientation of the panels (clockwise angle from south) */
        orientation: 0,
        _orientationSetter: function (value) {
            if (value != this.orientation) {
                this.orientation = value;
                if (this.panel_area) {
                    this.emit("modified");
                }
            }
        },

        /** Spacing between panel rows (meters) */
        row_spacing: 1,
        _row_spacingSetter: function (value) {
            if (value != this.row_spacing) {
                this.row_spacing = value;
                if (this.panel_area) {
                    this.emit("modified");
                }
            }
        },

        /** Panel size (meters) */
        panel_size: {
            width: 2.1,
            depth: 1
        },
        _panel_sizeSetter: function (value) {
            if (value != this.panel_size) {
                this.panel_size = value;
                if (this.panel_area) {
                    this.emit("modified");
                }
            }
        },

        /*---- Other modifiable panel properties  ----*/
        /** Panel efficiency (default 20%) */
        panel_efficiency: 0.20,
        _panel_efficiencySetter: function (value) {
            this.panel_efficiency = value;
            if (this.panel_area) {
                this.emit("modified");
            }
        },

        /** Single panel nominal power W */
        panel_power: 450,

        /*------      Read-only array properties      ------*/
        /** Panel array nominal power W: panel_power * panel count */
        array_power: 0,
        _array_powerSetter: function (value) {
            console.warn("array_power is read-only property")
        },

        /** Total panel area: panel_size.wodth * panel_size.depth * panel count */
        array_area: 0,
        _array_areaSetter: function (value) {
            console.warn("array_area is read-only property")
        },

        /** Roof area: the area in m2 of the size of the selected polygon */
        roof_area: 0,
        _roof_areaSetter: function (value) {
            console.warn("roof_area is read-only property");
        },
        _roof_areaGetter: function () {
            if (this.panel_area) {
                return geodesicUtils.geodesicAreas([webMercatorUtils.webMercatorToGeographic(this.panel_area)], esri.Units.METERS)[0];
            } else {
                console.warn("A polygon has not been set for its area to be calculated.");
            }
        },



        // No counstructor

        /** @function getPanelGraphics
         *  Constracts and returns array of esri graphics object representing
         *  solar panel location.
         */
        getPanelGraphics: function () {
            this._changeAttrValue("_panelGraphics", null);
            result = [];
            if (!this.panel_area) {
                console.warn("Panel area polygon has not been set.");
                return result;
            } else {
                var areaExtent = graphicsUtils.graphicsExtent([new Graphic(this.panel_area)]).expand(3);
                var polygons = getPolygons(areaExtent, this.orientation, this.panel_size.width, this.panel_size.depth, this.angle, this.row_spacing, this.panel_area);
                var highlightedSymbol = new SimpleFillSymbol(SimpleFillSymbol.STYLE_SOLID, null,
                    new Color([255, 255, 1, 1]));

                for (var i = 0; i < polygons.length; i++) {
                    result.push(new Graphic(polygons[i], highlightedSymbol));
                }

                this._changeAttrValue("yearly_production_kwh", 0);
                this._changeAttrValue("_panelGraphics", result);

                return result;
            }


        },

        /** Derived Properties */

        /** Array of Panel Graphics */
        _panelGraphics: null,


        /** Power of the system */
        system_power: 0,

        /** Annual Production measured in KWh */
        yearly_production_kwh: 0,
        _yearly_production_kwhSetter: function (value) {
            if (Math.abs(this.yearly_production_kwh - value) > 0.5) {
                this.yearly_production_kwh = value;
            }
        },

        /** Annual Production measured in AED */
        yearly_production_aed: 0,
        _yearly_production_aedSetter: function (value) {
            if (Math.abs(this.yearly_production_aed - value) > 0.5) {
                this.yearly_production_aed = value;
                if (this.is_customer) {
                    this.set("yearly_production_kwh", tariffCalculator.calculateUsage(value, this.tariffType));
                }
            }
        },

        /** Monthly Production measured in KWh */
        monthly_production_kwh: 0,
        _monthly_production_kwhSetter: function (value) {
            console.warn("monthly_production_kwh is read-only property");
        },
        _monthly_production_kwhGetter: function () {
            return this.yearly_production_kwh / 12;
        },

        /** Monthly Production measured in AED */
        monthly_production_aed: 0,
        _monthly_production_aedSetter: function (value) {
            console.warn("monthly_production_aed is read-only property");
        },
        _monthly_production_aedGetter: function () {
            if (this.is_customer) {
                return this.yearly_production_aed / 12;
            } else {
                console.warn("monthly_production_aed cannot be retrieved without a user having been set");
            }
        },

        userAnnualSpending:0,
        userMonthlyUsage: null,

        /** Percentage of annual Savings for User */
        annual_savings: 0,
        _annual_savingsSetter: function (value) {
            console.warn("annual_savings is read-only property");
        },
        _annual_savingsGetter: function () {
            if (this.is_customer) {
                if(this.userMonthlyUsage == null) {
                    var currentSpending = this.userAnnualSpending;
                    var newConsumption = this.userAnnualUsage - this.yearly_production_kwh;
                    if (newConsumption < 0) {
                        return 100;
                    } else {
                        var newSpending = tariffCalculator.calculateCost(newConsumption/12, this.tariffType)*12;
                        return (currentSpending - newSpending) / currentSpending * 100;
                    }
                } else {
                    var sortedMonthlyUsage = this.userMonthlyUsage.sort(function(a,b) {
                        if (a.index < b.index) {
                            return -1;
                        }
                        if (a.index > b.index) {
                            return 1;
                        }
                        return 0;
                    });
                    var currentUsageItem;
                    var newUsage;
                    var newSpending = 0;
                    var leftOver = 0;
                    var monthlyProduction = this.get("monthly_production_kwh");
                    for (var i=0; i<sortedMonthlyUsage.length; i++) {
                        
                        currentUsageItem = sortedMonthlyUsage[i];
                        newUsage = currentUsageItem.usageKWh - monthlyProduction - leftOver;
                        //console.debug("Month: " + currentUsageItem.month + "/" + currentUsageItem.year + ", Usage: " + currentUsageItem.usageKWh + ", Generation: " + monthlyProduction + ", Left Over: " + leftOver + ", New Usage: " + newUsage);
                        if (newUsage > 0) {
                            newSpending += tariffCalculator.calculateCost(newUsage, this.tariffType);
                            leftOver = 0;
                        } else if (newUsage == 0) {
                            leftOver = 0;
                        } else {
                            leftOver = -1 * newUsage;
                        }                        

                        
                    }
                    return (1- (newSpending/this.userAnnualSpending)) * 100;
                }
            } else {
                console.warn("annual_savings cannot be retrieved without a user having been set");
            }
        },

        /** Carbon Dioxide Emissions Reduced */
        co2_reduction: 0,
        _co2_reductionSetter: function (value) {
            console.warn("co2_reduction is read-only property");
        },
        _co2_reductionGetter: function () {
            return this.yearly_production_kwh * 0.4241;
        },

        /** Number of trees planted */
        trees_planted: 0,
        _trees_plantedSetter: function (value) {
            console.warn("trees_planted is read-only property");
        },
        _trees_plantedGetter: function () {
            return this.get("co2_reduction") * 0.02592;
        },

        /** Kms driven */
        kms_driven: 0,
        _kms_drivenSetter: function (value) {
            console.warn("kms_driven is read-only property");
        },
        _kms_drivenGetter: function () {
            return this.get("co2_reduction") * 3.858;
        },

        recalculatePanelsByProduction: function () {
            if (this.contextualizedPanels) {
                app.cascadeSliders = false;
                var sum = 0;
                var panels = 0;
                var panelsByProduction = this.contextualizedPanels.sort(this.compareByProduction);
                this.set("yearly_production_kwh", this.yearly_production_kwh);
                for (var i = 0; i < panelsByProduction.length; i++) {
                    if (sum + panelsByProduction[i].production < this.yearly_production_kwh) {
                        sum += panelsByProduction[i].production;
                        panelsByProduction[i].turnedOn = true;
                        panels++;
                    } else {
                        panelsByProduction[i].turnedOn = false;
                    }
                }
                this.contextualizedPanels = panelsByProduction.sort(this.compareById);
                if (this.is_customer) {
                    this.set("yearly_production_aed", tariffCalculator.calculateCost(this.yearly_production_kwh/12, this.tariffType)*12);
                }
                this.set("panel_count", panels);
                this.set("system_power", panels * this.get("panel_power") / 1000);
                this.set("panel_pctg", panels / this.contextualizedPanels.length * 100);
                window.setTimeout(function () {
                    app.cascadeSliders = true;
                }, 200);
            }
        },

        compareById: function (a, b) {
            if (a.id < b.id) {
                return -1;
            }
            if (a.id > b.id) {
                return 1;
            }
            return 0;
        },

        compareByProduction: function (a, b) {
            if (a.production > b.production) {
                return -1;
            }
            if (a.production < b.production) {
                return 1;
            }
            return 0;
        },

        panel_count: 0,
        panel_pctg: 0,
        _panel_pctgSetter: function (value) {
            this.panel_pctg = value;
            if (this.contextualizedPanels) {
                this.set("panel_count", this.panel_pctg / 100 * this.contextualizedPanels.length);
            }
        },

        recalculatePanelsByCount: function () {
            if (this.contextualizedPanels) {
                app.cascadeSliders = false;
                var sum = 0;
                var panels = 0;
                var panelsByProduction = this.contextualizedPanels.sort(this.compareByProduction);
                for (var i = 0; i < panelsByProduction.length; i++) {
                    if (i < this.panel_count) {
                        sum += panelsByProduction[i].production;
                        panelsByProduction[i].turnedOn = true;
                        panels++;
                    } else {
                        panelsByProduction[i].turnedOn = false;
                    }
                }
                this.contextualizedPanels = panelsByProduction.sort(this.compareById);
                this.set("yearly_production_kwh", sum);
                this.set("panel_pctg", this.panel_count / this.contextualizedPanels.length * 100);
                this.set("system_power", this.panel_count * this.get("panel_power") / 1000);
                if (this.is_customer) {
                    this.set("yearly_production_aed", tariffCalculator.calculateCost(this.yearly_production_kwh/12, this.tariffType)*12);
                }
                window.setTimeout(function () {
                    app.cascadeSliders = true;
                }, 200);
            }
        },

        togglePanel: function (panelId) {
            var clickedPanel = this.contextualizedPanels.filter(function (panel) {
                return panel.id == panelId;
            })[0];
            clickedPanel.turnedOn = !clickedPanel.turnedOn;
        },

        recalculatePanelsByExplicitPanels: function () {
            if (this.contextualizedPanels) {
                app.cascadeSliders = false;
                var sum = 0;
                var panels = 0;
                for (var i = 0; i < this.contextualizedPanels.length; i++) {
                    if (this.contextualizedPanels[i].turnedOn) {
                        sum += this.contextualizedPanels[i].production;
                        panels++;
                    }
                }
                this.set("panel_count", panels)
                this.set("yearly_production_kwh", sum);
                this.set("panel_pctg", this.panel_count / this.contextualizedPanels.length * 100);
                this.set("system_power", this.panel_count * this.get("panel_power") / 1000);
                if (this.is_customer) {
                    this.set("yearly_production_aed", tariffCalculator.calculateCost(this.yearly_production_kwh/12, this.tariffType)*12);
                }
                if (app.recalculatePanelsByExplicitPanelsTimeout) {
                    window.clearTimeout(app.recalculatePanelsByExplicitPanelsTimeout);
                }
                app.recalculatePanelsByExplicitPanelsTimeout = window.setTimeout(function () {
                    app.recalculatePanelsByExplicitPanelsTimeout = 0;
                    app.cascadeSliders = true;
                }, 500);
            }
        },

        _system_powerSetter: function (value) {
            this.system_power = value;
            this.set("panel_count", value / (this.get("panel_power") / 1000));
        },


        /** @function getPanelCentroids
         *  Returns array of esri point geometry objects representing
         *  centroids of panels generated in getPanelGraphics() method
         */
        getPanelCentroids: function () {
            var result = [];
            var panels = this._panelGraphics;
            for (var i = 0; i < panels.length; i++) {
                result.push(new Graphic(panels[i].geometry.getCentroid(), null, {
                    "OBJECTID": i + 1000,
                    "aspect": this.orientation + 180,
                    "slope": this.angle
                }, null));
            }
            return new FeatureSet({
                displayFieldName: "",
                geometryType: "esriGeometryPoint",
                fields: [{
                        "name": "OBJECTID",
                        "type": "esriFieldTypeOID",
                        "alias": "OBJECTID"
                    },
                    {
                        "name": "aspect",
                        "type": "esriFieldTypeSmallInteger",
                        "alias": "ORIENTATION"
                    },
                    {
                        "name": "slope",
                        "type": "esriFieldTypeSmallInteger",
                        "alias": "ANGLE"
                    }
                ],
                features: result
            });
        },

        /** @function calculate
         *  Enriches panel graphics objects with insolation calculated on the
         *  server, and with derived properties calculated as in current
         *  roof class. It also updates array_production and derived solar
         *  array properties.
         */
        calculate: function () {
            var that = this;
            this.contextualizedPanels = null;
            var result = [];
            var stillGoing = true;
            var cancelReason = "";

            var promise = new Deferred(function (reason) {
                stillGoing = false;
                cancelReason = reason;
            });

            if (that._panelGraphics.length < app.maxPanelCount) {
                var gp = new Geoprocessor(app.geoProcessorUrl);
                gp.execute({
                        "panel_points": that.getPanelCentroids()
                    },
                    function (results, messages) {
                        if (stillGoing) {
                            var insolationFeatures = results[0].value.features;
                            for (var i = 0; i < insolationFeatures.length; i++) {
                                var panelInsolation = insolationFeatures[i].attributes.T0;
                                var panelProduction = that.panel_size.width * that.panel_size.depth * that.panel_efficiency * panelInsolation / 100000;
                                result.push({
                                    id: insolationFeatures[i].attributes.inputId,
                                    insolation: panelInsolation,
                                    production: panelProduction,
                                    turnedOn: true
                                });
                                that._changeAttrValue("yearly_production_kwh", that.yearly_production_kwh + panelProduction);

                            }
                            that.contextualizedPanels = result;
                            that.set("yearly_production_kwh", that.yearly_production_kwh);
                            that.set("panel_count", insolationFeatures.length);
                            that.set("system_power", that.get("panel_count") * (that.get("panel_power") / 1000));
                            that.set("panel_pctg", 100);
                            that.recalculatePanelsByCount();
                            promise.resolve();
                        } else {
                            promise.reject({
                                code: 3,
                                message: cancelReason
                            });
                        }
                    },
                    function (error) {
                        promise.reject({
                            code: 2,
                            message: error
                        });
                    });
            } else {
                promise.reject({
                    code: 1,
                    message: "{panelCountError.message}"
                });
            }

            return promise;
        },

        contextualizedPanels: null
    });
});
