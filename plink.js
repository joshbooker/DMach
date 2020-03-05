(function () {
    // jscs:disable
    var version = "0.0.1",
        removed = false,
        stop = false,
        events = {},
        current_event,
        slice = Array.prototype.slice,
        keepAliveMsg = {type: "keepAlive"},
        isChrome = /Chrome/.test(navigator.userAgent) && !/Mobile/.test(navigator.userAgent) && !/Windows/.test(navigator.userAgent);
    //PRIVATE FRAMEWORK
    var DMAF = Object.create(null);

    //PUBLIC FRAMEWORK
    dmaf = Object.create(null);

    //dipatches an event to the client
    dmaf.dispatch = function (eventName) {
        var e = events,
            ce = current_event,
            result = [],
            args = slice.call(arguments, 1);
        current_event = eventName;
        stop = false;
        e = events[eventName];
        if (!e) e = [];
        for (var i = 0; i < e.length; i++) {
            result.push(e[i].apply(e[i].context, args));
            if (removed) {
                i--;
                removed = false;
            }
            if (stop) {
                break;
            }
        }
        current_event = ce;
        return result.length ? result : null;
    };
    //used by client to send messages to dmaf
    dmaf.tell = function (eventName, eventProperties, eventTime) {
        if (!eventTime) {
            eventTime = parseInt(DMAF.context.currentTime * 1000, 10);
        }
        switch(eventName) {
            case "ping":
            case "latency":
                proceedSync(eventName, eventProperties);
                return;
            case "sync":
                sync();
                return;
            case "broadcastPosition":
                broadcastPosition();
                return;
            case "keep_dead":
                keepAlive(false);
                return;
            case "startPosition":
                keepAlive(true);
        }
        DMAF.MainController(eventName, eventTime, eventProperties);
    };
    //client can use to add event listener. called with dmaf.dispatch. context here is optional.
    dmaf.addEventListener = function (eventName, handler, context) {
        var e = events;
        e = e[eventName] || (e[eventName] = []);
        for (var i = 0, ii = e.length; i < ii; i++) if (e[i] === handler) {
            return handler;
        }
        handler.context = (context && typeof context === "object") ? context : dmaf;
        e.push(handler);
    };
    //client can use to remove an event listener
    dmaf.removeEventListener = function (eventName, handler, context) {
        var e = events,
            i;
        e = e[eventName];
        if (!e || !e.length) {
            return;
        }
        i = e.length;
        while (i--) if (e[i] == handler) {
            e.splice(i, 1);
            removed = true;
            break;
        }
    };
    //binds an event handler which only runs once
    dmaf.once = function (eventName, handler, context) {
        handler.context = (context && typeof context === "object") ? context : dmaf;
        var one = function () {
            var result = handler.apply(context, arguments);
            dmaf.removeEventListener(eventName, one);
            return result;
        };
        dmaf.addEventListener(eventName, one, context);
    };
    //can be used inside event handler to get name of the event that is currently executing.
    dmaf.currentEvent = function () {
        return current_event;
    };
    //can be used in event handler to stop event propagation
    dmaf.stop = function () {
        stop = true;
    };
    //sends the message to all including self
    dmaf.registerBroadcaster = function (callback) {
        this.broadcaster = callback;
    };
    //send the message to all excluding self
    dmaf.registerEmitter = function (callback) {
        this.emitter = callback;
    };
    //send the message to all excluding self
    dmaf.registerServerEmitter = function(callback) {
        this.tellServer = callback;
    };

    //PRIVATE FUNCTIONS
    function broadcast (eventName, data) {
        data.type = eventName;
        dmaf.broadcaster(data);
    }
    function emit (eventName, data) {
        data.type = eventName;
        dmaf.emitter(data);
    }
    function broadcastPosition () {
        dmaf.emitter({
            type: "startAtPosition",
            songPosition: DMAF.ProcessorManager.getActiveInstance("master").songPosition,
            time: parseInt(DMAF.ProcessorManager.getActiveInstance("master").nextBeatTime + DMAF.serverOffset, 10)
        });
    }
    function sync () { //performSync
        //start sending pings
        sync.timesToSync = 10;
        sync.timesSynced = 0;
        sync.travelTimes = [];
        sync.clientTimes = [];
        sync.offsets = [];
       //console.time("ping DMAF level");
        dmaf.tellServer({
            clientTime: DMAF.context.currentTime * 1000,
            type: "ping"
        });
    }
    function proceedSync (eventName, data) {
        //console.timeEnd("ping DMAF level");
        var currentTime = DMAF.context.currentTime * 1000,
            travelTime = parseInt((currentTime - data.clientTime) / 2, 10),
            offset = parseInt(data.serverTime + travelTime - currentTime, 10);
        sync.travelTimes.push(travelTime);
        sync.clientTimes.push(data.clientTime);
        sync.offsets.push(offset);
        //console.log("travled time (one way):", travelTime, "offset to server:", offset);
        if(sync.timesSynced < sync.timesToSync) {
            sync.timesSynced++;
            //console.time("ping DMAF level");
            dmaf.tellServer({
                clientTime: DMAF.context.currentTime * 1000,
                type: "ping"
            });
        } else {
            DMAF.serverOffset = parseInt(DMAF.Utils.calculateAverage(sync.offsets), 10);
            if (isChrome) {
                DMAF.serverOffset -= 35;
            }
            //console.log("sync done, offset is", DMAF.serverOffset, sync.clientTimes);
            dmaf.tellServer({
                type: "syncDone"
            });
        }
    }
    function keepAlive (doKeepAlive) {
        if(doKeepAlive) {
            keepAlive.interval = setTimeout(send, 50);
        } else {
            clearTimeout(keepAlive.interval);
        }
    }
    function send () {
        //console.log("keep alive sent");
        dmaf.tellServer(keepAliveMsg);
        keepAlive.interval = setTimeout(send, 50);
    }
    window.addEventListener("DOMContentLoaded", function () {
        dmaf.dispatch("start_loading", DMAF);
    });

    //debug only...
    window.DMAF = DMAF;
})();/*
This is the DMAFInit module. This module is responsible for coordinating the loading of
the various parts and assets of the framework.

When the DMAFInit function is called the following is always and necessarily true.
    a. DMAF is defined (private), but NOT populated with the modules.
    b. dmaf is defined (public), and all public functions are available.
    c. All javascripts are loaded, modules are not initialized.


*/
dmaf.once("start_loading", function DMAFInit(DMAF) {
    //Specify where to find the settings xml.
    //Declaring a few vars at the top of the scope first
    var settingsSrc = "xml/DMAFsettings.xml",
        types = ["int", "float", "string", "boolean", "list", "array", "enum"],
        attr = "getAttribute",
        propertyModel = {
            "automatable": "boolean",
            "default": "fromType",
            "valueType": "string",
            "loadEvent": "string",
            "value": "fromType",
            "min": "fromType",
            "max": "fromType",
            "name": "string",
            "type": "string",
            "values": "list",
            "unit": "string",
            "src": "string"
        },
        separator = /[\.\:\,]/,
        librariesToLoad = 0,
        librariesLoaded = 0;

    //----<<<<LOADING BEGINS>>>>--//
    //-- 1. LOADING AUDIO CONTEXT
    //First we'll try to create an audio context.
    try {
        if(window.AudioContext) {
            DMAF.context = new AudioContext();
        } else {
            DMAF.context = new webkitAudioContext();
        }
        //Make the context public for client in case they want to access currentTime
        dmaf.context = DMAF.context;
    } catch (e) {
        //dispatching a fail event will allow the client to implement some specific code to handle
        //if dmaf fails to initialize
        dmaf.dispatch("dmaf_fail");
        //If context is not available, we will replace the dmaf object with a dummy object
        dmaf.tell = dummy;
        dmaf.notSupported = true;
        dmaf.dispatch = dummy;
        dmaf.addEventListener = function (trigger, callback) {
            callback(trigger);
        };
        dmaf.once = function (trigger, callback) {
            callback(trigger);
        };
        dmaf.registerEmitter = dummy;
        dmaf.registerBroadcaster = dummy;
        dmaf.registerServerEmitter = dummy;
        dmaf.context = {
            currentTime: 0
        };
        //Return will cancel any further loading at this point.
        return;
    }
    //-- 2. REQUEST AND PARSE SETTINGS XML FILE
    //If we have made it past the try/catch it's safe to go ahead and request and parse the settings
    xmlXhr(settingsSrc, function parseSettings(xml) {
        var settings = xml.querySelectorAll("modules,config,paths,formats"),
            result = DMAF.Settings = {},
            outer, inner, attrs, keys, key, jj, j;
        for (var i = 0, ii = settings.length; i < ii; i++) {
            outer = settings[i].querySelectorAll("*");
            if (!outer.length) {
                //console.error("Unable to parse DMAF.settings");
                continue;
            }
            result[settings[i].tagName] = (outer[0].attributes.length) ? {} : [];
            for (j = 0, jj = outer.length; j < jj; j++) {
                inner = outer[j];
                if (inner.attributes.length) {
                    result[settings[i].tagName][inner.tagName] = parseProperty(inner);
                    result[settings[i].tagName][inner.tagName].type = inner.tagName;
                } else {
                    result[settings[i].tagName][j] = inner.tagName;
                }
            }
        }
        //Once we have the settings, we can begin to load the modules
        loadModules();
    });

    //-- 3. LOAD FRAMEWORK MODULES

    function loadModules() {
        for (var i = 0, ii = DMAF.Settings.modules.length; i < ii; i++) {
            //We iterate through all the modules and dispatch load events to each module
            //In the order they were given in DMAFSettings.xml
            if (DMAF.Settings.modules[i] !== "MainController") {
                //We don't want to load the MainController yet because we haven't loaded any actions.
                dmaf.dispatch("load_" + DMAF.Settings.modules[i], DMAF);
            }
        }
        //Now that Utils module is loaded we might as well check what format to use here.
        DMAF.Utils.checkFormat();
        //Once completed we have now populated the DMAF namespace with all managers, and instances.
        //So now we'll request the descriptors with a callback to parse them.
        xmlXhr(DMAF.Settings.config.descriptors.src, parseDescriptors);
    }

    //-- 4. PARSE DESCRIPTORS XML
    //Once we've recieved the descriptors XML from the request we will parse the descriptors.

    function parseDescriptors(xml) {
        var descriptors = DMAF.Descriptors = {},
            descriptorNodes = xml.querySelectorAll("descriptor"),
            descriptor, properties, current, property, class_, type, keys, key, id, jj, j;
        for (var i = 0, ii = descriptorNodes.length; i < ii; i++) {
            descriptor = descriptorNodes[i];
            id = descriptor[attr]("id");
            type = descriptor[attr]("type");
            class_ = descriptor[attr]("class");
            method = descriptor[attr]("method");
            descriptors[class_] = descriptors[class_] || {};
            descriptors[class_][type] = descriptors[class_][type] || {};
            descriptors[class_][type][id] = descriptors[class_][type][id] || {};
            properties = descriptor.querySelectorAll("property");
            current = descriptors[class_][type][id];
            for (j = 0, jj = properties.length; j < jj; j++) {
                property = properties[j][attr]("name");
                current[property] = parseProperty(properties[j]);
            }
        }
        //Now that the descriptors are parsed we can request the actions
        xmlXhr(DMAF.Settings.config.actions.src, parseActions);
    }
    //-- 5. PARSE ACTIONS XML
    //Once we've parsed the descriptors we can go ahead and parse the actions
    //And we can also populate the action manager with these actions

    function parseActions(xml) {
        var nodeNames = Object.keys(DMAF.Descriptors.action).join(","),
            actionNodes = xml.querySelectorAll(nodeNames),
            actionProperties, descriptor, triggers, method, action, delay, type, keys = DMAF.Descriptors.action,
            key, id;
        for (var i = 0, ii = actionNodes.length; i < ii; i++) {
            descriptor = DMAF.Descriptors.action[actionNodes[i].tagName][actionNodes[i][attr]("id")];
            actionProperties = parseActionProperties(actionNodes[i], descriptor, actionNodes[i].tagName);
            id = actionNodes[i][attr]("id");
            id = id[0].toUpperCase() + id.substring(1, id.length);
            method = actionNodes[i][attr]("method") || "onAction";
            delay = parseInt(actionNodes[i][attr]("delay"), 10) || 0;
            type = actionNodes[i].tagName;
            type = type[0].toUpperCase() + type.substring(1, type.length);
            action = new DMAF.Action(actionProperties, type, id, method, delay);
            action.triggers = actionNodes[i][attr]("triggers").split(separator);
            DMAF.ActionManager.addAction(action);
        }
        //Libraries to load before we dispatch dmaf_init should be added to the actions_ready trigger
        //We can check how many libraries we need to load by looking at the length of this array.
        if (DMAF.ActionManager.triggers.preload_assets) {
            for (i = 0, ii = DMAF.ActionManager.triggers.preload_assets.length; i < ii; i++) {
                if (DMAF.ActionManager.triggers.preload_assets[i].id === "LoadAsset") {
                    DMAF.ActionManager.triggers.preload_assets[i].actionProperties.returnEvent = "library_loaded";
                    librariesToLoad++;
                }
            }
        }
        dmaf.dispatch("load_MainController", DMAF);
        if (librariesToLoad) {
            dmaf.addEventListener("library_loaded", checkLibraries);
            DMAF.MainController("preload_assets");
        } else {
            //If there are no libraries to preload, we just dispatch these events straight away
            DMAF.MainController("init_routing");
            dmaf.dispatch("dmaf_init");
        }
    }
    //-- 6. CHECK LIBRARY LOADING
    //this handler should be called each time a library is loaded.
    //this is not implemented yet but will be added into DMAFAssets.js
    function checkLibraries() {
        if (++librariesLoaded === librariesToLoad) {
            //We'll dispatch dmaf_init to the main controller first in case any actions are bound to this.
            DMAF.MainController("init_routing");
            //TODO: Change to dmaf_ready
            //Now we'll notify the client that dmaf is ready to go.
            dmaf.dispatch("dmaf_init");
            dmaf.removeEventListener("library_loaded", checkLibraries);
        }
    }

    //----<<<<LOADING ENDS>>>>--//
    //----<<<<HELPER FUNCTIONS>>>>--//
    //This is our dummy function to replace on the global dmaf object if audio context is not available


    function dummy() {
        //console.log("DMAF is unavailable.");
        return {};
    }
    //This is a function that give us back an xml request with a given callback


    function xmlXhr(src, callback) {
        var xhr = new XMLHttpRequest();
        xhr.open("GET", src, true);
        xhr.__src = src;
        xhr.onreadystatechange = function () {
            if (this.readyState == 4 && this.status == 200) {
                if (this.responseXML) {
                    callback(this.responseXML);
                } else {
                   //console.error("DMAF Error: " + this.__src + " is missing or malformed.");
                }
            }
        };
        xhr.send(null);
    }
    //Parses attributes from an xml element into a properties object


    function parseProperty(element) {
        var attrs = element.attributes,
            result = {},
            name;
        for (var i = 0, ii = attrs.length; i < ii; i++) {
            name = attrs[i].nodeName;
            result[name] = fromString(propertyModel[name], attrs[i].value, element);
        }
        return result;
    }
    //Translates an attribute value from a string to the appropriate type
    function fromString(type, value, model) {
        if (value === undefined) return undefined;
        switch (type) {
        case "string":
            return value;
        case "boolean":
            return value === "true";
        case "int":
            return parseInt(value, 10);
        case "float":
            return parseFloat(value);
        case "list":
            return value.split(separator);
        case "enum":
            return value;
        case "fromType":
            if (model[attr]) {
                return fromString(model[attr]("type"), value, model);
            } else if ("type" in model) {
                return fromString(model.type, value, model);
            } else {
                //console.error("Unable to retrieve type information for " + type + " with value " + value + " for " + model);
            }
            break;
        default:
            //console.error(type, value, model);
        }
    }
    //Parses attributes of an xml element using a descriptor object
    function parseAttributes(target, node, descriptor) {
        var keys = Object.keys(descriptor),
            value, key, i;
        for (i = 0;
        (key = keys[i++]);) {
            if (!node.hasAttribute(key)) {
                continue;
            }
            value = fromString(descriptor[key].type, node[attr](key), descriptor[key]);
            target[key] = DMAF.Utils.verify(descriptor[key], value);
        }
    }
    //Checks if a value present on the descriptor is undefined, sets default value
    function defaultCheck(target, descriptor, name) {
        var keys = Object.keys(descriptor),
            value, key, i;
        for (i = 0;
        (key = keys[i++]);) {
            if (target[key] === undefined) {
                target[key] = descriptor[key]["default"];
            }
        }
        return target;
    }
    //Checks if element's descriptor contains one or more arrays
    function arrayCheck(descriptor) {
        var keys = Object.keys(descriptor),
            result = [],
            key, i;
        for (i = 0;(key = keys[i++]);) {
            if (descriptor[key].type === "array") {
                result.push(descriptor[key]);
            }
        }
        return result;
    }
    //Parses attributes of type array
    function parseArray(node, descriptor, valueType) {
        var typeDescriptor = DMAF.Descriptors.type[valueType],
            elements = node.querySelectorAll(valueType),
            subDescriptor, result = [],
            element, subNode, arrays, temp, id, jj, j;
        for (var i = 0, ii = elements.length; i < ii; i++) {
            id = elements[i][attr]("id") || elements[i].tagName;
            if (id in typeDescriptor) {
                element = {
                    id: id
                };
                parseAttributes(element, elements[i], typeDescriptor[id]);
                arrays = arrayCheck(typeDescriptor[id]);
                for (j = 0, jj = arrays.length; j < jj; j++) {
                    subDescriptor = arrays[j];
                    subNode = elements[i].querySelector(subDescriptor.name);
                    element[subDescriptor.name] = parseArray(subNode, subDescriptor, subDescriptor.valueType);
                }
                result.push(element);
            } else {
                //console.error("Config Parsing Error: Unrecognized element ID or tagName in Array: " + valueType);
            }
        }
        return result;
    }
    //Parses the action properties from an action type xml element
    function parseActionProperties(actionNode, descriptor, name) {
        var properties = actionNode.querySelectorAll("properties"),
            arrays = arrayCheck(descriptor),
            keys = Object.keys(descriptor),
            subDescriptor, subNode, result = {},
            elements, current, key, jj, j, i, ii;
        //Parse all properties tags for this action
        for (i = 0, ii = properties.length; i < ii; i++) {
            parseAttributes(result, properties[i], descriptor);
        }
        //Parse all arrays
        for (i = 0, ii = arrays.length; i < ii; i++) {
            subDescriptor = arrays[i];
            subNode = actionNode.querySelector(subDescriptor.name);
            if (!subNode) {
                result[subDescriptor.name] = [];
                continue;
            }
            result[subDescriptor.name] = parseArray(subNode, subDescriptor, subDescriptor.valueType);
        }

        return defaultCheck(result, descriptor, name);
    }
    //we bind the kick_note function so that a client can dispatch this on some touch event in iOS.
    dmaf.addEventListener("kick_note", function kicknote() {
        var kick = DMAF.context.createBufferSource(),
            buffer = DMAF.context.createBuffer(1, 100, 44100);
        kick.buffer = buffer;
        kick.start(0);
    });
});
dmaf.addEventListener("load_Utils", function load_Utils (DMAF) {
    var INT = "int",
        FLOAT = "float",
        STRING = "string",
        BOOLEAN = "boolean",
        validVariable = /^[a-zA-Z_$][0-9a-zA-Z_$]*$/,
        UID = 0,
        numsort = function (a, b) {
            return a - b;
        };

    DMAF.Utils = {
        calculateAverage: function (array) {
            var sum = 0;
            for (var i = 0; i < array.length; i++) {
                sum += array[i];
            }
            return sum / array.length;
        },
        checkFormat: function () {
            var a = document.createElement('audio'),
                formats = DMAF.Settings.formats;
            function canPlayFormat(format) {
                switch (format) {
                case "wav":
                    return !!(a.canPlayType && a.canPlayType('audio/wav; codecs="1"').replace(/no/, ''));
                case "mp3":
                    return !!(a.canPlayType && a.canPlayType('audio/mpeg;').replace(/no/, ''));
                case "aac":
                    return !!(a.canPlayType && a.canPlayType('audio/mp4; codecs="mp4a.40.2"').replace(/no/, ''));
                case "ogg":
                    return !!(a.canPlayType && a.canPlayType('audio/ogg; codecs="vorbis"').replace(/no/, ''));
                default:
                    return false;
                }
            }
            for (var i = 0, ii = formats.length; i < ii; i++) {
                if (canPlayFormat(formats[i])) {
                    DMAF.fileFormat = "." + formats[i];
                    break;
                } else {
                    DMAF.fileFormat = false;
                }
            }
            if (!DMAF.fileFormat) {
                DMAF.error("Couldn't play any of the wanted file formats!");
            }
        },
        dbToJSVolume: function (db) {
            var volume = Math.max(0, Math.round(100 * Math.pow(2, db / 6)) / 100);
            return Math.min(1, volume);
        },
        dbToWAVolume: function (db) {
            return Math.max(0, Math.round(100 * Math.pow(2, db / 6)) / 100);
        },
        capitalize: function (string) {
            return string[0].toUpperCase() + string.substring(1, string.length);
        },
        /*
         * This makes it possible to retrieve instances and manipulate those
         */
        DynamicValueRetriever: {
            getTargetProperty: function (string, trigger) {
                var chain = string.split(":"),
                    result;
                switch (chain[0]) {
                case "sound":
                    result = DMAF.SoundManager.getActiveInstance(chain[0]);
                    break;
                case "processor":
                    result = DMAF.ProcessorManager.getActiveInstance(chain[0]);
                    break;
                case "synth":
                    result = DMAF.SynthManager.getActiveInstance(chain[0]);
                    break;
                case "bus":
                    result = DMAF.AudioBusManager.getActiveInstance(chain[0]);
                    break;
                default:
                    result = chain[0];
                }
                for (var i = 1, ii = chain.length; i < ii; i++) {
                    if (result[chain[i]] !== undefined) {
                        if (chain[i] === "trigger") {
                            chain[i] = trigger;
                        }
                        result = result[chain[i]];
                    } else {
                        return; //console.error("Unable to find specified property.");
                    }
                }
            },
            getTargetInstance: function (chainString) {
                var chain = chainString.split(":");
                var target;
                switch (chain[0]) {
                case "sound":
                    target = DMAF.SoundManager.getActiveInstance(chain[1]);
                    break;
                case "synth":
                    target = DMAF.SynthManager.getActiveInstance(chain[1]);
                    break;
                case "bus":
                    target = DMAF.AudioBusManager.getActiveInstance(chain[1]);
                    break;
                }
                return target;
            },
            getValueFromString: function (chainString) {
                //console.log("I'M NOT TESTED YET!");
                var chain = chainString.split(":");
                var target;
                switch (chain[0]) {
                case "sound":
                    target = DMAF.Managers.getSoundManager().getActiveSoundInstances(chain[1]);
                    break;
                }
                var value;
                if (target["get" + chain[2][0].toUpperCase() + chain[2].slice(1)]) { //we have a defined getter
                    value = target["get" + chain[2][0].toUpperCase() + chain[2].slice(1)]();
                } else {
                    value = target[chain[2]];
                }
                return value;
            }
        },
        createUID: function () {
            return UID++;
        },
        /**
         * Creates an effect chain that connects to the input parameter
         *
         * @method createEffectsRecursive
         * @param lastFx {AudioNode}
         * @param effectsArray {Array}
         *
         */
        createEffectsRecursive: function (lastFx, effectsArray) {
            var effects = [],
                fxProperties, effect;
            for (var i = 0; i < effectsArray.length; i++) {
                fxProperties = effectsArray[i];
                effect = new DMAF.AudioNodes[this.capitalize(fxProperties.id)](fxProperties);
                if (fxProperties.active) {
                    effect.activate(true);
                } else {
                    effect.activate(false);
                }
                effects.push(effect);
                // connect to the previous effect
                lastFx.connect(effect.input);
                lastFx = effect;
            }
            return effects;
        },
        fromString: function (type, value) {
            if (value === undef) return undefined;
            switch (type) {
            case "string":
                return value;
            case "boolean":
                return value === "true";
            case "int":
                return parseInt(value, 10);
            case "float":
                return parseFloat(value);
            case "list":
                return value.split(separator);
            default:
                //console.error("FromString Error: ", type, value);
            }
        },
        /**
         * Returns the remainder of the division between the 2 floating point numbers
         *
         * @param {float} x The dividend
         * @param {float} y The divisor
         * @return {float} The remainder
         */
        fmod: function (x, y) {
            // http://kevin.vanzonneveld.net
            // +   original by: Onno Marsman
            // +      input by: Brett Zamir (http://brett-zamir.me)
            // +   bugfixed by: Kevin van Zonneveld (http://kevin.vanzonneveld.net)
            // *     example 1: fmod(5.7, 1.3);
            // *     returns 1: 0.5
            var tmp, tmp2, p = 0,
                pY = 0,
                l = 0.0,
                l2 = 0.0;

            tmp = x.toExponential().match(/^.\.?(.*)e(.+)$/);
            p = parseInt(tmp[2], 10) - (tmp[1] + '').length;
            tmp = y.toExponential().match(/^.\.?(.*)e(.+)$/);
            pY = parseInt(tmp[2], 10) - (tmp[1] + '').length;

            if (pY > p) {
                p = pY;
            }
            tmp2 = (x % y);
            if (p < -100 || p > 20) {
                // toFixed will give an out of bound error so we fix it like this:
                l = Math.round(Math.log(tmp2) / Math.log(10));
                l2 = Math.pow(10, l);
                return (tmp2 / l2).toFixed(l - p) * l2;
            } else {
                return parseFloat(tmp2.toFixed(-p));
            }
        },
        logicMIDIMap: {
            cflat: -1,
            c: 0,
            csharp: 1,
            dflat: 1,
            d: 2,
            dsharp: 3,
            eflat: 3,
            e: 4,
            esharp: 5,
            fflat: 4,
            f: 5,
            fsharp: 6,
            gflat: 6,
            g: 7,
            gsharp: 8,
            aflat: 8,
            a: 9,
            asharp: 10,
            bflat: 10,
            b: 11,
            bsharp: 12
        },
        isValidVariableName: function (value) {
            return value && validVariable.test(value);
        },
        /**
         * Converts a midi note to corresponding pitch
         *
         * @param {int} midiNote The note to be converted
         * @return {Number} The resulting pitch
         */
        MIDIToFrequency: function (midiNote) {
            return 8.1757989156 * Math.pow(2.0, midiNote / 12.0);
        },
        /**
         * Returns the function sign of the argument
         *
         * @param {float} arg The number
         * @return {float} The sign of the argument
         */
        objClone: function (obj) {
            if (Object(obj) !== obj) {
                return obj;
            }
            var res = Object.create(obj);
            for (var key in obj) if (obj.hasOwnProperty(key)) {
                res[key] = DMAF.Utils.objClone(obj[key]);
            }
            return res;
        },
        requestNextFrame: (function () {
            return window.requestAnimationFrame || window.webkitRequestAnimationFrame || window.mozRequestAnimationFrame || window.oRequestAnimationFrame || window.msRequestAnimationFrame ||
            function (callback) {
                window.setTimeout(callback, 1000 / 60);
            };
        })(),
        sign: function (x) {
            if (x === 0) {
                return 1;
            } else {
                return Math.abs(x) / x;
            }
        },
        /**
         * Returns the hyperbolic tangent of the argument
         *
         * @param {float} arg The absissa to be evaluated
         * @return {float} The hyperbolic tangent of the argument
         */
        tanh: function (arg) {
            return (Math.exp(arg) - Math.exp(-arg)) / (Math.exp(arg) + Math.exp(-arg));
        },
        /**
         * Converts a note from Logic (in the format "C2") to midi note (value 0 to 127)
         *
         * @param {String} logicNote The note to be converted
         * @return {int} The resulting midi note
         */
        toMIDINote: function (logicNote) {
            var midiNote, note, mod, octave, octavePosition;
            if (logicNote[1] === "#" || logicNote[1].toLowerCase() === "s") {
                note = logicNote[0].toLowerCase() + "sharp";
                octavePosition = 2;
            } else if (logicNote[1] === "b") {
                note = logicNote[0].toLowerCase() + "flat";
                octavePosition = 2;
            } else {
                note = logicNote[0].toLowerCase();
                octavePosition = 1;
            }
            note = DMAF.Utils.logicMIDIMap[note];
            if (logicNote[octavePosition] === "-") {
                octave = ((0 - parseInt(logicNote[octavePosition + 1], 10)) + 2) * 12;
                //negative octave (logic maps midi note 0 as C-2)
            } else {
                octave = (parseInt(logicNote[octavePosition], 10) + 2) * 12;
            }
            midiNote = octave + note;
            return midiNote;
        },
        unique: function (arr) {
            return arr.filter(function (elem, pos) {
                arr.indexOf(elem) == pos;
            }).sort(numsort);
        },
        verify: function (model, value, name) {
            var error;
            if (typeof model === "string") {
                model = this.defaults[model];
            }
            if (value === undefined) {
                return model["default"];
            }
            if (model.type === undefined) {
                //console.error("DMAF Verification Error: Malformed defaults object.");
            }
            switch (model.type) {
            case "int":
                if (parseFloat(value) !== parseInt(value, 10)) {
                    error = typeError;
                }
            case "float":
                if (isNaN(value)) {
                    error = typeError;
                }
                if (value < model.min) {
                    error = rangeErrorMin;
                }
                if (value > model.max) {
                    error = rangeErrorMax;
                }
                break;
            case "string":
                if (typeof value !== "string") {
                    error = typeError;
                }
                break;
            case "list":
                if (!(value instanceof Array)) {
                    error = typeError;
                }
                break;
            case "enum":
                if (model.values) {
                    if (model.values.indexOf(value) === -1) {
                        error = listError;
                    } else {
                        break;
                    }
                } else {
                    //console.error("DMAF Verification Error! Missing values list for enum type value.");
                    error = true;
                }
                break;
            case "boolean":
                if (typeof value !== "boolean") {
                    error = typeError;
                }
                break;
            default:
                //console.error("DMAF Verification Error! Malformed defaults object. Please check the descriptors.xml");
            }
            if (!error) {
                return value;
            } else {
                error(value, model);
                return model["default"];
            }
        }
    };
    Object.defineProperty(DMAF, "logLevel", {
        get: function () {
            return this._logLevel;
        },
        set: function (level) {
            this._logLevel = level;
            switch (level) {
            case "debug":
                this._debugLevel = 1;
                break;
            case "warn":
                this._debugLevel = 1;
                break;
            case "error":
                this._debugLevel = 2;
                break;
            case "all":
                this._debugLevel = 2;
                break;
            default:
                //console.error("DMAF: Unrecognized log level", level);
            }
        }
    });
    Object.defineProperty(DMAF, "logChannel", {
        get: function () {
            return this._logChannel;
        },
        set: function (channel) {
            this._logChannel = channel;
            if (channel !== "console") {
                this._log = [];
                this._warn = [];
                this._error = [];
                this.__customChannel = true;
            } else {
                this.__customChannel = false;
            }
        }
    });
    DMAF.debug = function () {
        if (DMAF._debugLevel > 0) {
            if (!this.__customChannel) {
                //console.log(DMAF.context.currentTime, arguments);
            } else {
                this._log.push({
                    time: DMAF.context.currentTime,
                    type: "debug",
                    log: arguments
                });
            }
        }
    };
    DMAF.warn = function () {
        if (DMAF._debugLevel > 0) {
            if (!this.__customChannel) {
                //console.warn(DMAF.context.currentTime, arguments);
            } else {
                this._warn.push({
                    time: DMAF.context.currentTime,
                    type: "warning",
                    log: arguments
                });
            }
        }
    };
    DMAF.error = function () {
        if (DMAF._debugLevel > 1) {
            if (!this.__customChannel) {
                //console.error(DMAF.context.currentTime, arguments);
            } else {
                this._error.push({
                    time: DMAF.context.currentTime,
                    type: "error",
                    log: arguments
                });
            }
        }
    };

    function typeError(value, model) {
        DMAF.error("DMAF TypeError for " + model.name + ": " + value + " is not of type " + model.type);
        return model["default"];
    }

    function rangeErrorMin(value, model) {
        DMAF.error("DMAF RangeError for " + model.name + ": " + value + " is below minimum threshold.");
        return model.min;
    }

    function rangeErrorMax(value, model) {
        DMAF.error("DMAF RangeError for " + model.name + ": " + value + " is above maximum threshold.");
        return model.max;
    }

    function listError(value, model) {
        DMAF.error("DMAF enumError for " + model.name + ": " + value + " is not an allowed value");
        return model["default"];
    }

    //Temp, move to XML
    DMAF.logLevel = "all";
    DMAF.logChannel = "console";
});dmaf.once("load_Assets", function (DMAF) {
    var tag = "getElementsByTagName",
        has = "hasOwnProperty",
        hasAttr = "hasAttribute",
        attr = "getAttribute",
        midi = "midi",
        sound = "sound",
        undef = "undefined",
        samplemap = "samplemap",
        none = "none",
        def = "default",
        separator = /[\.\:\,]/,
        types = ["int", "float", "string", "boolean", "list", "array", "enum"],
        propertyModel = {
            "automatable": "boolean",
            "default": "fromType",
            "valueType": "string",
            "loadEvent": "string",
            "value": "fromType",
            "min": "fromType",
            "max": "fromType",
            "name": "string",
            "type": "string",
            "values": "list",
            "unit": "string",
            "src": "string"
        };
    DMAF.Asset = {};
    DMAF.Asset.LoadAsset = function (properties) {
        var files = [],
            callback = function () {
                if (properties.returnEvent) {
                    //console.log("dispatching " + properties.returnEvent + " from success callback of LoadAsset Action");
                    dmaf.dispatch(properties.returnEvent);
                }
                DMAF.AssetsManager.removeInstance(properties.instanceId);
            },
            loader;
        for (var i = 0, ii = properties.files.length; i < ii; i++) {
            files[i] = properties.files[i].name;
        }
        return getLoader(properties.assetType, properties.baseURL, files, callback);
    };
    function SampleMapLoader (url, files, callback) {
        this.url = url;
        this.files = files;
        this.format = ".xml";
        this.onload = callback;
        this.loadCount = 0;
        DMAF.AssetsManager.loadsInProgress += this.files.length;
    }
    SampleMapLoader.prototype = {
        loadFile: function (path) {
            var loader = this,
                callback = function () {
                    DMAF.AssetsManager.loadsInProgress--;
                    parseSampleMapXML.callback = undefined;
                    if (++loader.loadCount === loader.files.length) {
                        loader.onload();
                        return;
                    } else {
                        loader.loadFile(loader.url + loader.files[loader.loadCount] + loader.format);
                    }
                };
            parseSampleMapXML.callback = callback;
            xmlXhr(path, parseSampleMapXML);
        },
        onAction: function () {
            this.loadFile(this.url + this.files[this.loadCount] + this.format);
        }
    };
    function MidiLoader (url, files, callback) {
        this.url = url;
        this.files = files;
        this.format = ".mid";
        this.onload = callback;
        this.loadCount = 0;
        DMAF.AssetsManager.loadsInProgress += this.files.length;
    }
    MidiLoader.prototype = {
        loadFile: function (fileName, path) {
            var loader = this,
                callback = function (pattern) {
                    DMAF.AssetsManager.loadedBeatPatterns[pattern.patternId] = pattern;
                    DMAF.AssetsManager.loadsInProgress--;
                    if (++loader.loadCount === loader.files.length) {
                        loader.onload();
                        return;
                    }
                    if (loader.loadCount < loader.files.length) {
                        loader.loadFile(loader.files[loader.loadCount], loader.url + loader.files[loader.loadCount] + loader.format);
                    }
                };
            parseMidiFile(fileName, path, callback);
        },
        onAction: function () {
            this.loadFile(this.files[this.loadCount], this.url + this.files[this.loadCount] + this.format);
        }
    };
    function BufferLoader (url, files, callback) {
        this.fileFormat = DMAF.fileFormat;
        this.total = files.length;
        this.fileNames = files;
        this.onload = callback;
        this.loadCount = 0;
        this.path = url;
    }
    BufferLoader.prototype = {
        loadBuffer: function (url, name) {
             var loader = this,
                request = new XMLHttpRequest();
            function onload (e) {
                if (e.target.readyState === 4 && e.target.status > 199 && e.target.status < 305) {
                    //console.log("Recieved back " + name + " from XHR. Decoding this file.");
                    DMAF.context.decodeAudioData(request.response, ondecode, onerror);
                }
            }
            function ondecode (buffer) {
                loader.loadCount++;
                DMAF.AssetsManager.loadedSounds[name] = buffer;
                //console.log("Successfully decoded " + name + ". Number decoded = " + loader.loadCount);
                if (loader.loadCount === loader.total) {
                    //console.group("LOAD JOB COMPLETE!");
                    //console.log("BufferLoader has reached the end of the que.");
                    //console.log("The number of files successfully decoded was " + loader.loadCount);
                    //var now = new Date().getTime();
                    //console.log("This load job took " + (now - loader.startTime) + " milliseconds.");
                    //console.groupEnd();
                    loader.onload();
                }
            }
            request.onload = onload;
            request.onerror = onerror;
            request.open("GET", url, true);
            request.responseType = "arraybuffer";
            request.send();
        },
        onAction: function () {
            //console.log("Starting a load job with " + this.total + " total files.");
            this.startTime = new Date().getTime();
            //console.groupCollapsed("Requests sent: ");
            for (var i = 0, ii = this.total; i < ii; i++) {
                //console.log("Sending XHR for " + this.fileNames[i] + ". Request no. " + i);
                this.loadBuffer(this.path + this.fileNames[i] + this.fileFormat, this.fileNames[i]);
            }
           //console.groupEnd();
        }
    };
    DMAF.AssetsManager = {
        loadedBeatPatterns: {},
        loadedSounds: {},
        activeLoaders: {},
        loadsInProgress: 0
    };
    DMAF.AssetsManager.addInstance = function (loader) {
        this.activeLoaders[loader.instanceId] = loader;
    };
    DMAF.AssetsManager.removeInstance = function (id) {
        return delete this.activeLoaders[id];
    };
    DMAF.AssetsManager.getBeatPattern = function (patternId) {
        return this.loadedBeatPatterns[patternId] || false;
    };
    DMAF.AssetsManager.getBuffer = function (sampleName) {
        var buffer = DMAF.AssetsManager.loadedSounds[sampleName];
        return buffer || "loading";
    };
    DMAF.AssetsManager.preloadSamples = function (sampleNames, loader) {
        return;
    };
    DMAF.AssetsManager.getActiveInstance = function (id) {
        return this.activeLoaders[id] || false;
    };
    function onerror (e) {
       //console.error("BufferLoader error! ", e);
    }
    function getLoader (type, url, files, callback) {
        switch (type) {
            case "SOUND":
                return new BufferLoader(url, files, callback);
            case "MIDI":
                return new MidiLoader(url, files, callback);
            case "SAMPLE_MAP":
                return new SampleMapLoader(url, files, callback);
        }
    }
    function parseSampleMapXML(xml) {
        var tag = "getElementsByTagName",
            attr = "getAttribute",
            par = xml[tag]("samplemaps")[0],
            maps = par[tag]("samplemap"),
            keys = ["sound", "root", "low", "hi", "vol"],
            kk = keys.length,
            ranges, map, name, jj, j, k;

        for (var i = 0, ii = maps.length; i < ii; i++) {
            map = maps[i];
            name = map[attr]("name");
            ranges = map[tag]("range");
            DMAF.SynthManager.sampleMaps[name] = Object.create(null);
            for (j = 0, jj = ranges.length; j < jj; j++) {
                DMAF.SynthManager.sampleMaps[name]["range_" + j] = Object.create(null);
                for (k = 0, kk = keys.length; k < kk; k++) {
                    key = keys[k];
                    if (k === 4) {
                        DMAF.SynthManager.sampleMaps[name]["range_" + j][key] = parseFloat(ranges[j][attr](key));
                    } else {
                        DMAF.SynthManager.sampleMaps[name]["range_" + j][key] = ranges[j][attr](key);
                    }
                }
            }
        }
        if (parseSampleMapXML.callback) {
            parseSampleMapXML.callback();
        }
    }
    function parseMidiFile(fileName, midiPath, callback) {
        DMAF.AssetsManager.loadedBeatPatterns.empty_pattern = new DMAF.Processor.BeatPattern('empty_pattern', 1);
        function parseMidi(fileName, callback) {
            //reset absolute time for each track
            var absoluteTime = 0;
            var patternNameToStart = fileName;

            function readChunk(stream) {
                absoluteTime = 0;
                var id = stream.readTo(4);
                var length = stream.read32BitInt();
                return {
                    id: id,
                    length: length,
                    data: stream.readTo(length)
                };
            }

            var lastEventType;

            function readEvent(stream) {
                var event = {};
                event.absoluteTime = (absoluteTime += stream.readVariableLengthInt());
                var eventTypeByte = stream.read8BitInt();
                if ((eventTypeByte & 0xf0) == 0xf0) { /* system / meta event */
                    if (eventTypeByte == 0xff) { /* meta event */
                        event.type = 'meta';
                        var subtypeByte = stream.read8BitInt();
                        var length = stream.readVariableLengthInt();
                        switch (subtypeByte) {
                        case 0x00:
                            event.subtype = 'sequenceNumber';
                            if (length != 2) return;
                            event.number = stream.read16BitInt();
                            return event;
                        case 0x01:
                            event.subtype = 'text';
                            event.text = stream.readTo(length);
                            return event;
                        case 0x02:
                            event.subtype = 'copyrightNotice';
                            event.text = stream.readTo(length);
                            return event;
                        case 0x03:
                            event.subtype = 'trackName';
                            event.text = stream.readTo(length);
                            return event;
                        case 0x04:
                            event.subtype = 'instrumentName';
                            event.text = stream.readTo(length);
                            return event;
                        case 0x05:
                            event.subtype = 'lyrics';
                            event.text = stream.readTo(length);
                            return event;
                        case 0x06:
                            event.subtype = 'marker';
                            event.text = stream.readTo(length);
                            return event;
                        case 0x07:
                            event.subtype = 'cuePoint';
                            event.text = stream.readTo(length);
                            return event;
                        case 0x20:
                            event.subtype = 'midiChannelPrefix';
                            if (length != 1) return;
                            event.channel = stream.read8BitInt();
                            return event;
                        case 0x2f:
                            event.subtype = 'endOfTrack';
                            if (length != 0) return;
                            return event;
                        case 0x51:
                            event.subtype = 'setTempo';
                            if (length != 3) return;
                            event.microsecondsPerBeat = (
                            (stream.read8BitInt() << 16) + (stream.read8BitInt() << 8) + stream.read8BitInt());
                            return event;
                        case 0x54:
                            event.subtype = 'smpteOffset';
                            if (length != 5) return;
                            var hourByte = stream.read8BitInt();
                            event.frameRate = {
                                0x00: 24,
                                0x20: 25,
                                0x40: 29,
                                0x60: 30
                            }[hourByte & 0x60];
                            event.hour = hourByte & 0x1f;
                            event.min = stream.read8BitInt();
                            event.sec = stream.read8BitInt();
                            event.frame = stream.read8BitInt();
                            event.subframe = stream.read8BitInt();
                            return event;
                        case 0x58:
                            event.subtype = 'timeSignature';
                            if (length != 4) return;
                            event.numerator = stream.read8BitInt();
                            event.denominator = Math.pow(2, stream.read8BitInt());
                            event.metronome = stream.read8BitInt();
                            event.thirtyseconds = stream.read8BitInt();
                            return event;
                        case 0x59:
                            event.subtype = 'keySignature';
                            if (length != 2) return;
                            event.key = stream.read8BitInt();
                            event.scale = stream.read8BitInt();
                            return event;
                        case 0x7f:
                            event.subtype = 'sequencerSpecific';
                            event.data = stream.readTo(length);
                            return event;
                        default:
                            event.subtype = 'unknown';
                            event.data = stream.readTo(length);
                            return event;
                        }
                        event.data = stream.readTo(length);
                        return event;
                    } else if (eventTypeByte == 0xf0) {
                        event.type = 'sysEx';
                        var length = stream.readVariableLengthInt();
                        event.data = stream.readTo(length);
                        return event;
                    } else if (eventTypeByte == 0xf7) {
                        event.type = 'dividedSysEx';
                        var length = stream.readVariableLengthInt();
                        event.data = stream.readTo(length);
                        return event;
                    } else {
                        event.type = 'unknown';
                        var length = stream.readVariableLengthInt();
                        event.data = stream.readTo(length);
                        DMAF.error('unknown MIDI event type byte of length' + length);
                    }
                } else { /* channel event */
                    var param1;
                    if ((eventTypeByte & 0x80) == 0) {
                        param1 = eventTypeByte;
                        eventTypeByte = lastEventType;
                    } else {
                        param1 = stream.read8BitInt();
                        lastEventType = eventTypeByte;
                    }
                    var eventType = eventTypeByte >> 4;
                    event.channel = eventTypeByte & 0x0f;
                    event.type = 'channel';
                    switch (eventType) {
                    case 0x08:
                        event.subtype = 'noteOff';
                        event.midiNote = param1;
                        event.velocity = stream.read8BitInt();
                        return event;
                    case 0x09:
                        event.midiNote = param1;
                        event.velocity = stream.read8BitInt();
                        if (event.velocity == 0) {
                            event.subtype = 'noteOff';
                        } else {
                            event.subtype = 'noteOn';
                        }
                        return event;
                    case 0x0a:
                        event.subtype = 'noteAftertouch';
                        event.midiNote = param1;
                        event.amount = stream.read8BitInt();
                        return event;
                    case 0x0b:
                        event.subtype = 'controller';
                        event.controllerType = param1;
                        event.value = stream.read8BitInt();
                        return event;
                    case 0x0c:
                        event.subtype = 'programChange';
                        event.programNumber = param1;
                        return event;
                    case 0x0d:
                        event.subtype = 'channelAftertouch';
                        event.amount = param1;
                        return event;
                    case 0x0e:
                        event.subtype = 'pitchBend';
                        event.value = param1 + (stream.read8BitInt() << 7);
                        return event;
                    default:
                        event.subtype = 'unknown';
                        DMAF.error('Unrecognised MIDI event type: ' + eventType);
                    }
                }
            }
            var xhr = new XMLHttpRequest();
            xhr.open('GET', midiPath, true);
            xhr.overrideMimeType('text/plain; charset=x-user-defined');
            xhr.onload = function (e) {
                if (e.target.status !== 200) {
                   //console.error("Bad XML reponse in midi request");
                    return;
                }
                var response = e.target.response || '';

                var result = [];
                var length = response.length;
                var charCode = String.fromCharCode;
                try {
                    for (var z = 0; z < length; z++) {
                        result[z] = charCode(response.charCodeAt(z) & 255);
                    }
                } catch (a) {
                    //console.log("Midi Error", a);
                }
                var data = result.join('');
                stream = midistream(data);
                var headerChunk = readChunk(stream);
                if (headerChunk.id != 'MThd' || headerChunk.length != 6) {
                    //console.error('Found no header in midi file..');
                    return;
                }
                var headerStream = midistream(headerChunk.data);
                var formatType = headerStream.read16BitInt();
                var trackCount = headerStream.read16BitInt();
                var timeDivision = headerStream.read16BitInt();

                if (timeDivision & 0x8000) {
                    ticksPerBeat = 480;
                    //console.error('Time division in SMPTE, defaulting to 480 ticks per beat');
                } else {
                    ticksPerBeat = timeDivision;
                }

                var header = {
                    formatType: formatType,
                    trackCount: trackCount,
                    ticksPerBeat: ticksPerBeat
                };

                var tracks = [];
                for (var i = 0; i < header.trackCount; i++) {
                    tracks[i] = [];
                    var trackChunk = readChunk(stream);
                    if (trackChunk.id != 'MTrk') {
                        //console.error('Expected MTrk but I got ' + trackChunk.id);
                        return;
                    }
                    var trackStream = midistream(trackChunk.data);
                    while (!trackStream.endOfFile()) {
                        var event = readEvent(trackStream);
                        tracks[i].push(event);
                    }
                }
                //Create DMAF pattern
                var numberOfTracks = header.trackCount;
                var ticksPerBeat = header.ticksPerBeat;
                var beatLengthInTicks = ticksPerBeat / 4;
                //skip track 1 (only meta)
                for (var k = 1; k < numberOfTracks; k++) {
                    var patternArray = tracks[k];
                    var patternToCreate = patternArray[0].text;
                    var patternTrigger = patternArray[1].text;
                    var pattern = new DMAF.Processor.BeatPattern(patternToCreate, 1);
                    for (var j = 2; j < patternArray.length; j++) {
                        if (patternArray[j].subtype === 'noteOn') {
                            var theEvent = patternArray[j];
                            var position = theEvent.absoluteTime;
                            var beat = Math.floor(position / beatLengthInTicks);
                            var tick = Math.floor(position - beat * beatLengthInTicks);
                            var duration;
                            for (var l = j; l < patternArray.length; l++) {
                                if (patternArray[l].subtype === 'noteOff' && patternArray[l].midiNote === theEvent.midiNote || patternArray[l].subtype === 'noteOn' && patternArray[l].velocity === 0 && patternArray[l].midiNote === theEvent.midiNote) {
                                    duration = patternArray[l].absoluteTime - theEvent.absoluteTime;
                                    break;
                                }
                            }
                            pattern.addEvent(patternTrigger, beat + 1, tick + 1, {
                                midiNote: theEvent.midiNote,
                                velocity: theEvent.velocity,
                                type: theEvent.subtype,
                                duration: duration,
                                channel: theEvent.channel
                            });
                        }
                    }
                    callback(pattern);
                }
            };
            xhr.send(null);
        }

        function midistream(midiString) {
            var pointer = 0;

            function read32BitInt() {
                var result = ((midiString.charCodeAt(pointer) << 24) + (midiString.charCodeAt(pointer + 1) << 16) + (midiString.charCodeAt(pointer + 2) << 8) + midiString.charCodeAt(pointer + 3));
                pointer += 4;
                return result;
            }

            function read16BitInt() {
                var result = ((midiString.charCodeAt(pointer) << 8) + midiString.charCodeAt(pointer + 1));
                pointer += 2;
                return result;
            }

            function read8BitInt() {
                var result = midiString.charCodeAt(pointer);
                pointer += 1;
                return result;
            }

            function readTo(pos) {
                var result = midiString.substr(pointer, pos);
                pointer += pos;
                return result;
            }

            function endOfFile() {
                return pointer >= midiString.length;
            }

            function readVariableLengthInt() {
                var returnInt = 0;
                while (true) {
                    var byten = read8BitInt();
                    if (byten & 0x80) {
                        returnInt += (byten & 0x7f);
                        returnInt <<= 7;
                    } else {
                        return returnInt + byten;
                    }
                }
            }

            return {
                endOfFile: endOfFile,
                readTo: readTo,
                read32BitInt: read32BitInt,
                read16BitInt: read16BitInt,
                read8BitInt: read8BitInt,
                readVariableLengthInt: readVariableLengthInt
            };
        }

        parseMidi(fileName, callback);
    }
    function xmlXhr(src, callback) {
        var xhr = new XMLHttpRequest();
        xhr.open("GET", src, true);
        xhr.__src = src;
        xhr.onreadystatechange = function () {
            if (this.readyState == 4 && this.status == 200) {
                if (this.responseXML) {
                    callback(this.responseXML);
                } else {
                    //console.error("DMAF Error: " + this.__src + " is missing or malformed.");
                }
            }
        };
        xhr.send(null);
    }
});dmaf.once("load_Actions", function load_Actions (DMAF) {
    var stop = false;
    DMAF.ActionManager = {
        triggers: {},
        addAction: function (action) {
            for (var i = 0, ii = action.triggers.length; i < ii; i++) {
                trigger = action.triggers[i];
                this.triggers[trigger] = this.triggers[trigger] || [];
                this.triggers[trigger].push(action);
            }
        },
        stop: function () {
            stop = true;
        },
        onEvent: function (trigger, eventTime, eventProperties) {
            var actions = this.triggers[trigger],
                actionTime = eventTime || DMAF.context.currentTime * 1000;
            stop = false;
            if (!actions || !actions.length) {
                //console.group("NO ACTION FOR TRIGGER IN ACTION MANAGER");
                //console.log("trigger: " + trigger);
                //console.log("eventTime: ", eventTime);
                //console.log("eventProperties: ", eventProperties);
                //console.groupEnd();
                return;
            }
            actionTime += (this.delay ? this.delay : 0);
            for (var i = 0, ii = actions.length; i < ii; i++) {
                actions[i].execute(trigger, actionTime, eventProperties);
                if (stop) {
                    break;
                }
            }
        }
    };
    DMAF.Action = function (actionProperties, type, id, manager, delay) {
        this.delay = delay || 0;
        this.type = type;
        this.id = id;
        this.actionProperties = actionProperties;
        switch (this.id) {
        case "SynthInstance":
            manager = "SynthManager";
            break;
        case "GenericPlay":
        case "stepPlay":
            manager = "SoundManager";
            break;
        case "SoundStop":
            manager = null;
            break;
        case "LoadAsset":
            manager = "AssetsManager";
            break;
        case "Transform":
        case "Macro":
        case "EventStop":
        case "EventPropertyMap":
        case "BeatPatternPlayer":
            manager = "ProcessorManager";
            break;
        case "AudioBus":
            manager = "AudioBusManager";
            break;
        default:
            //console.error("Unrecognized id in DMAF.Action", id);
        }
        this.manager = DMAF[manager];
    };
    DMAF.Action.prototype.execute = function (trigger, actionTime, eventProperties) {
        var instance, instanceId, instanceProperties;
        if (!this.actionProperties) {
            //console.log("Missing actionProperties:", this, trigger, actionTime, eventProperties);
            return;
        }
        instanceId = this.actionProperties.instanceId === "multi" ? trigger : this.actionProperties.instanceId;
        
        if (this.manager) {
            instance = this.manager.getActiveInstance(instanceId);
        }
        if (!instance) {
            instanceProperties = Object.create(this.actionProperties);
            instanceProperties.instanceId = instanceId;
            instance = new DMAF[this.type][this.id](instanceProperties);
            if (this.manager) {
                instance.instanceId = instanceId;
                this.manager.addInstance(instance);
            }
        }
        instance.onAction(trigger, actionTime, eventProperties, this.actionProperties);
    };
});dmaf.once("load_MainController", function (DMAF) {
    var instruments = ["bassdist", "syntklocka_stab", "woody", "bziaou", "8bit_stab", "bee_long", "voice", "drums"],
        pentatonic = [0, 3, 5, 7, 10],
        activeUsers = [];

    DMAF.MainController = function (trigger, eventTime, eventProperties) {
        var user;
        switch (trigger) {
            case "1":
            case "2":
            case "3":
            case "6":
                return;
            case "sixteenth_notes":
                //if(eventTime < DMAF.context.currentTime * 1000){
                //    console.error("sixteenth_notes arrived after current time", DMAF.context.currentTime * 1000 - eventTime);
                //}
                var sustained, newNote, mouseDown, pending;
                for (var i = 0, ii = activeUsers.length; i < ii; i++) {
                    user = activeUsers[i];
                    user.getNote();
                    sustained = (user.selectedColor === 6 || user.selectedColor === 5 || user.selectedColor === 3);
                    newNote = user.currentNote !== user.previousNote;
                    mouseDown = user.mouseIsDown;
                    pending = user.hasNote;

                    if (sustained) {
                        if (mouseDown && newNote) {
                            noteOff(user.previousNote, eventTime, user.selectedColor, i);
                            noteOn(user.currentNote, eventTime, user.selectedColor, undefined, i);
                            user.previousNote = user.currentNote;
                        }
                        if (!newNote) {
                            user.hasNote = false;
                        }
                        if (!mouseDown) {
                            noteOff(user.currentNote, eventTime, user.selectedColor, i);
                            if (user.hasNote || (user.previousNote !== -1 && newNote)) {
                                noteOff(user.previousNote, eventTime, user.selectedColor, i);
                                noteOn(user.currentNote, eventTime, user.selectedColor, eventProperties.duration, i);
                            }
                            user.hasNote = false;
                            user.previousNote = -1;
                        }
                    } else {
                        if (mouseDown || pending) {
                            noteOn(user.currentNote, eventTime, user.selectedColor, eventProperties.duration, i);
                            user.hasNote = false;
                        }
                    }
                }
                return;
            case "user_joined":
                activeUsers.push(eventProperties);
                return;
            case "user_left":
                var id = activeUsers.indexOf(eventProperties);
                noteOff(eventProperties.currentNote, eventTime, eventProperties.selectedColor, id);
                activeUsers.splice(id, 1);
                return;
            case "destroySession":
                activeUsers = [];
                return;
            case "startPosition":
                if(DMAF.ProcessorManager.getActiveInstance("master").state === 1){
                    return;
                }
                //console.log("start time", eventProperties.time, "offset", DMAF.serverOffset);
                DMAF.ActionManager.onEvent("start", eventProperties.time - DMAF.serverOffset, eventProperties);
                return;
            case "logServerTime":
                //console.log("server time is:", parseInt(DMAF.context.currentTime * 1000 + DMAF.serverOffset, 10), "travel time:", DMAF.context.currentTime * 1000 - (eventProperties.serverTime - DMAF.serverOffset));
                return;
            case "beat":
                playKick(eventTime);
                dmaf.dispatch("beat");
                return;
            case "is_iPhone5":
                DMAF.compensateContextTime = true;
                return;
        }
        DMAF.ActionManager.onEvent(trigger, eventTime, eventProperties);
    };
    
    function noteOff(note, eventTime, color, userIndex) {
        if (note === -1) {
            return;
        }
        var newEvent = {
            midiNote: getNote(note, color),
            velocity: 0,
            type: "noteOff",
            duration: 0
        };
        DMAF.ActionManager.onEvent(instruments[color] + "_" + userIndex, eventTime, newEvent);
    }

    function noteOn(note, eventTime, color, duration, userIndex) {
        var newEvent = {
            midiNote: getNote(note, color),
            velocity: 112,
            type: "noteOn",
            duration: duration
        };
        DMAF.ActionManager.onEvent(instruments[color] + "_" + userIndex, eventTime, newEvent);
    }

    function getNote(plinkNote, instrument) {
        if (instrument === 7) {
            return 24 + plinkNote;
        }
        var octaveOffset = parseInt(plinkNote / 5, 10) * 12,
            scaleQuantized = pentatonic[plinkNote % 5];
        return 33 + octaveOffset + scaleQuantized;
    }

    function playKick(actionTime) {
        DMAF.ActionManager.onEvent("drums_0", actionTime, {
            midiNote: 24,
            velocity: 80,
            type: "noteOn",
            duration: 116
        });
    }
});
dmaf.once("load_Clock", function (DMAF) {
    var Clock = DMAF.Clock = Object.create(null),
        slice = Array.prototype.slice,
        frameIntervalRunning = false,
        pendingArrays = [],
        timeoutEvents = [],
        frameEvents = [],
        running = false,
        UID = 0,
        last, currentTime, id, f, t, i,
        raf = window.requestAnimationFrame ||
        window.webkitRequestAnimationFrame ||
        window.mozRequestAnimationFrame ||
        window.msRequestAnimationFrame ||
        window.oRequestAnimationFrame ||
        function (callback) {
            window.setTimeout(callback, 1000 / 60);
        },
        context = DMAF.context;

    DMAF.preListen = 40;

    function run () {
        var f = frameEvents.length;
        var t = timeoutEvents.length;
        currentTime = context.currentTime * 1000;
        if (!f && !t) {
            running = false;
            return;
        }
        while(f--) {
            frameEvents[f].callback.call(frameEvents[f].context);
        }
        while (t--){
            if(currentTime > timeoutEvents[t].actionTime - DMAF.preListen) {
                timeoutEvents[t].callback.apply(timeoutEvents[t].context, timeoutEvents[t].args);
                timeoutEvents.splice(t, 1);
            }
        }
        running = true;
        setTimeout(run, 20);
    }
    Clock.checkFunctionTime = function (actionTime, callback, pendingArray, context) {
        if(actionTime >= DMAF.context.currentTime * 1000 + DMAF.preListen) {
            var timeout = {
                callback: callback,
                actionTime: actionTime,
                context: context || DMAF,
                args: slice.call(arguments, 4),
                id: UID++
            };
            pendingArray.push(timeout.id);
            timeoutEvents.push(timeout);
            if (!running) {
                running = true;
                run();
                
            }
        } else {
            callback.apply(context, slice.call(arguments, 4));
        }
    };
    Clock.dropPendingArray = function (array) {
        var i = timeoutEvents.length,
            j;
        while(i-- && (j = array.length)) {
            while(j--) {
                if(array[j] === timeoutEvents[i].id) {
                    timeoutEvents.splice(i, 1);
                    array.splice(j, 1);
                }
            }
        }
        array.length = 0;
    };
    Clock.addFrameListener = function (id, callback, context) {
        frameEvents.push({
            callback: callback,
            context: context || DMAF,
            id: id
        });
        if (!running) {
            running = true;
            run();
        }
    };
    Clock.removeFrameListener = function (id) {
        var i = frameEvents.length;
        while(i--) {
            if(frameEvents[i].id === id) {
                frameEvents.splice(i, 1);
                return true;
            }
        }
        return false;
    };
});dmaf.once("load_AudioNodes", function (DMAF) {
    var AudioNodes = DMAF.AudioNodes = Object.create(null),
        filterTypes = {
            lowpass: "lowpass",
            highpass: "highpass",
            bandpass: "bandpass",
            lowshelf: "lowshelf",
            highshelf: "highshelf",
            peaking: "peaking",
            notch: "notch",
            allpass: "allpass"
        },
        delayConstants = {
            //  32nd Note
            "32": 0.125,
            //  16th Note triplet
            "16T": 0.16666666666666666,
            //  Dotted 32nd Note
            "32D": 0.1875,
            //  16th Note
            "16": 0.25,
            //  8th Note Triplet
            "8T": 0.3333333333333333,
            //  Dotted 16th Note
            "16D": 0.375,
            //  8th note
            "8": 0.5,
            //  Quarter Note Triplet
            "4T": 0.6666666666666666,
            //  Dotted Eighth Note
            "8D": 0.75,
            //  Quarter Note
            "4": 1,
            //  Half Note Triplet
            "2T": 1.3333333333333333,
            //  Dotted Quarter Note
            "4D": 1.5,
            //  Half Note
            "2": 2,
            //  Dotted Half Note
            "2D": 3,
            //  Whole Note
            "1": 4
        },
        pipe = function (param, val) {
            param.value = val;
        },
        Super = Object.create(null, {
            activate: {
                writable: true,
                value: function (doActivate) {
                    this.input.disconnect();
                    this._activated = doActivate;
                    if(doActivate) {
                        this.input.connect(this.activateNode);
                        if(this.activateCallback) {
                            this.activateCallback(doActivate);
                        }
                    } else {
                        this.input.connect(this.output);
                    }
                }
            },
            bypass: {
                get: function () {
                    return this._activated;
                },
                set: function (v) {
                    this.activate(v);
                }
            },
            connect: {
                value: function (target) {
                    this.output.connect(target);
                }
            },
            connectInOrder: {
                value: function (nodeArray) {
                    var i = nodeArray.length - 1;
                    while(i--) {
                        if(!nodeArray[i].connect) {
                            return DMAF.error("AudioNode.connectInOrder: TypeError: Not an AudioNode.", nodeArray[i]);
                        }
                        nodeArray[i].connect(nodeArray[i + 1]);
                    }
                }
            },
            setAutomatableProperty: {
                value: function (property, value, duration, actionTime) {
                    var _is = this.defaults[property],
                        param = this[property],
                        method;
                    actionTime = actionTime ? ~~ (actionTime / 1000) : DMAF.context.currentTime;
                    duration = duration = duration ? ~~ (duration / 1000) : 0;
                    if(param) {
                        value = this.verify(property, value);
                        if(_is.automatable) {
                            if(!duration) {
                                method = "setValueAtTime";
                            } else {
                                method = "linearRampToValueAtTime";
                                param.cancelScheduledValues(actionTime);
                                param.setValueAtTime(param.value, actionTime);
                            }
                            param[method](value, duration + actionTime);
                        } else {
                            param = value;
                        }
                    } else {
                        //console.error("Invalid Property for " + this.name);
                    }
                }
            },
            verify: {
                value: DMAF.Utils.verify
            }
        });
    //---------------------------------------------------------------------------------//
    //-------------------------------AudioNode Subclasses------------------------------//
    //---------------------------------------------------------------------------------//
    DMAF.AudioNodes.Filter = function (properties) {
        this.input = DMAF.context.createGain();
        this.filter = this.activateNode = DMAF.context.createBiquadFilter();
        this.output = DMAF.context.createGain();

        this.filter.connect(this.output);

        this.defaults = DMAF.Descriptors.type.audioNode.filter;
        this.frequency = properties.frequency;
        this.Q = properties.resonance;
        this.filterType = properties.filterType;
        this.gain = properties.gain;
    };
    DMAF.AudioNodes.Filter.prototype = Object.create(Super, {
        name: {
            value: "Filter"
        },
        filterType: {
            enumerable: true,
            get: function () {
                return this._filterType;
            },
            set: function (value) {
                this._filterType = this.verify("filterType", value);
                this.filter.type = filterTypes[this._filterType];
            }
        },
        Q: {
            enumerable: true,
            get: function () {
                return this.filter.Q;
            },
            set: function (value) {
                this.filter.Q.value = this.verify("Q", value);
            }
        },
        gain: {
            enumerable: true,
            get: function () {
                return this.filter.gain;
            },
            set: function (value) {
                this.filter.gain.value = this.verify("gain", value);
            }
        },
        frequency: {
            enumerable: true,
            get: function () {
                return this.filter.frequency;
            },
            set: function (value) {
                this.filter.frequency.value = this.verify("frequency", value);
            }
        }
    });
    //---------------------------------------------------------------------------------//
    DMAF.AudioNodes.Cabinet = function (properties) {
        this.input = DMAF.context.createGain();
        this.activateNode = DMAF.context.createGain();
        this.convolver = this.newConvolver(properties.impulsePath);
        this.makeupNode = DMAF.context.createGain();
        this.output = DMAF.context.createGain();

        this.activateNode.connect(this.convolver.input);
        this.convolver.output.connect(this.makeupNode);
        this.makeupNode.connect(this.output);

        this.defaults = DMAF.Descriptors.type.audioNode.cabinet;
        this.makeupGain = properties.makeupGain;
        this.convolver.activate(true);
    };
    DMAF.AudioNodes.Cabinet.prototype = Object.create(Super, {
        name: {
            value: "Cabinet"
        },
        makeupGain: {
            enumerable: true,
            get: function () {
                return this.makeupNode.gain;
            },
            set: function (value) {
                this.makeupNode.gain.value = this.verify("makeupGain", value);
            }
        },
        newConvolver: {
            value: function (impulsePath) {
                return new DMAF.AudioNodes.Convolver({
                    impulse: impulsePath,
                    dryLevel: 0,
                    wetLevel: 1
                });
            }
        }
    });
    //---------------------------------------------------------------------------------//
    DMAF.AudioNodes.Chorus = function (properties) {
        this.input = DMAF.context.createGain();
        this.attenuator = this.activateNode = DMAF.context.createGain();
        this.splitter = DMAF.context.createChannelSplitter(2);
        this.delayL = DMAF.context.createDelay();
        this.delayR = DMAF.context.createDelay();
        this.feedbackGainNodeLR = DMAF.context.createGain();
        this.feedbackGainNodeRL = DMAF.context.createGain();
        this.merger = DMAF.context.createChannelMerger(2);
        this.output = DMAF.context.createGain();

        this.lfoL = new DMAF.AudioNodes.LFO({
            target: this.delayL.delayTime,
            callback: pipe
        });
        this.lfoR = new DMAF.AudioNodes.LFO({
            target: this.delayR.delayTime,
            callback: pipe
        });

        this.input.connect(this.attenuator);
        this.attenuator.connect(this.output);
        this.attenuator.connect(this.splitter);
        this.splitter.connect(this.delayL, 0);
        this.splitter.connect(this.delayR, 1);
        this.delayL.connect(this.feedbackGainNodeLR);
        this.delayR.connect(this.feedbackGainNodeRL);
        this.feedbackGainNodeLR.connect(this.delayR);
        this.feedbackGainNodeRL.connect(this.delayL);
        this.delayL.connect(this.merger, 0, 0);
        this.delayR.connect(this.merger, 0, 1);
        this.merger.connect(this.output);

        this.defaults = DMAF.Descriptors.type.audioNode.chorus;
        this.feedback = properties.feedback;
        this.rate = properties.rate;
        this.delay = properties.delay;
        this.depth = properties.depth;
        this.lfoR.phase = Math.PI / 2;
        this.attenuator.gain.value = 0.6934; // 1 / (10 ^ (((20 * log10(3)) / 3) / 20))
        this.lfoL.activate(true);
        this.lfoR.activate(true);
    };
    DMAF.AudioNodes.Chorus.prototype = Object.create(Super, {
        name: {
            value: "Chorus"
        },
        delay: {
            enumerable: true,
            get: function () {
                return this._delay;
            },
            set: function (value) {
                this._delay = 0.0002 * Math.pow(10, this.verify("delay", value) * 2);
                this.lfoL.offset = this._delay;
                this.lfoR.offset = this._delay;
                this._depth = this._depth;
            }
        },
        depth: {
            enumerable: true,
            get: function () {
                return this._depth;
            },
            set: function (value) {
                this._depth = this.verify("depth", value);
                this.lfoL.oscillation = this._depth * this._delay;
                this.lfoR.oscillation = this._depth * this._delay;
            }
        },
        feedback: {
            enumerable: true,
            get: function () {
                return this._feedback;
            },
            set: function (value) {
                this._feedback = this.verify("feedback", value);
                this.feedbackGainNodeLR.gain.value = this._feedback;
                this.feedbackGainNodeRL.gain.value = this._feedback;
            }
        },
        rate: {
            enumerable: true,
            get: function () {
                return this._rate;
            },
            set: function (value) {
                this._rate = this.verify("rate", value);
                this.lfoL._frequency = this._rate;
                this.lfoR._frequency = this._rate;
            }
        }
    });
    //---------------------------------------------------------------------------------//
    DMAF.AudioNodes.Compressor = function (properties) {
        this.input = DMAF.context.createGain();
        this.compNode = this.activateNode = DMAF.context.createDynamicsCompressor();
        this.makeupNode = DMAF.context.createGain();
        this.output = DMAF.context.createGain();

        this.compNode.connect(this.makeupNode);
        this.makeupNode.connect(this.output);

        this.defaults = DMAF.Descriptors.type.audioNode.compressor;
        this.automakeup = properties.automakeup;
        this.makeupGain = properties.makeupGain;
        this.threshold = properties.threshold;
        this.release = properties.release;
        this.attack = properties.attack;
        this.ratio = properties.ratio;
        this.knee = properties.knee;
    };
    DMAF.AudioNodes.Compressor.prototype = Object.create(Super, {
        name: {
            value: "Compressor"
        },
        computeMakeup: {
            value: function () {
                var magicCoefficient = 4,
                    // raise me if the output is too hot
                    c = this.compNode;
                return -(c.threshold.value - c.threshold.value / c.ratio.value) / magicCoefficient;
            }
        },
        automakeup: {
            enumerable: true,
            get: function () {
                return this._automakeup;
            },
            set: function (value) {
                this._automakeup = this.verify("automakeup", value);
                if(this._automakeup) this.makeupGain = this.computeMakeup();
            }
        },
        threshold: {
            enumerable: true,
            get: function () {
                return this.compNode.threshold;
            },
            set: function (value) {
                this.compNode.threshold.value = this.verify("threshold", value);
                if(this._automakeup) this.makeupGain = this.computeMakeup();
            }
        },
        ratio: {
            enumerable: true,
            get: function () {
                return this.compNode.ratio;
            },
            set: function (value) {
                this.compNode.ratio.value = this.verify("ratio", value);
                if(this._automakeup) this.makeupGain = this.computeMakeup();
            }
        },
        knee: {
            enumerable: true,
            get: function () {
                return this.compNode.knee;
            },
            set: function (value) {
                this.compNode.knee.value = this.verify("knee", value);
                if(this._automakeup) this.makeupGain = this.computeMakeup();
            }
        },
        attack: {
            enumerable: true,
            get: function () {
                return this.compNode.attack;
            },
            set: function (value) {
                this.compNode.attack.value = (this.verify("attack", value) / 1000);
            }
        },
        release: {
            enumerable: true,
            get: function () {
                return this.compNode.release;
            },
            set: function (value) {
                this.compNode.release = this.verify("release", value) / 1000;
            }
        },
        makeupGain: {
            enumerable: true,
            get: function () {
                return this.makeupNode.gain;
            },
            set: function (value) {
                var temp = this.verify("makeupGain", value);
                this.makeupNode.gain.value = DMAF.Utils.dbToWAVolume(temp);
            }
        }
    });
    //---------------------------------------------------------------------------------//
    DMAF.AudioNodes.Convolver = function (properties) {
        this.input = DMAF.context.createGain();
        this.activateNode = DMAF.context.createGain();
        this.convolver = DMAF.context.createConvolver();
        this.dry = DMAF.context.createGain();
        this.filterLow = DMAF.context.createBiquadFilter();
        this.filterHigh = DMAF.context.createBiquadFilter();
        this.wet = DMAF.context.createGain();
        this.output = DMAF.context.createGain();

        this.activateNode.connect(this.filterLow);
        this.activateNode.connect(this.dry);
        this.filterLow.connect(this.filterHigh);
        this.filterHigh.connect(this.convolver);
        this.convolver.connect(this.wet);
        this.wet.connect(this.output);
        this.dry.connect(this.output);

        this.defaults = DMAF.Descriptors.type.audioNode.convolver;
        this.dryLevel = properties.dryLevel;
        this.wetLevel = properties.wetLevel;
        this.highCut = properties.highCut;
        this.buffer = properties.impulse;
        this.lowCut = properties.lowCut;
        this.level = properties.level;
        this.filterHigh.type = "lowpass";
        this.filterLow.type = "highpass";
    };
    DMAF.AudioNodes.Convolver.prototype = Object.create(Super, {
        name: {
            value: "Convolver"
        },
        lowCut: {
            get: function () {
                return this.filterLow.frequency;
            },
            set: function (value) {
                this.filterLow.frequency.value = this.verify("lowCut", value);
            }
        },
        highCut: {
            get: function () {
                return this.filterHigh.frequency;
            },
            set: function (value) {
                this.filterHigh.frequency.value = this.verify("highCut", value);
            }
        },
        level: {
            get: function () {
                return this.output.gain;
            },
            set: function (value) {
                this.output.gain.value = this.verify("level", value);
            }
        },
        dryLevel: {
            get: function () {
                return this.dry.gain;
            },
            set: function (value) {
                this.dry.gain.value = this.verify("dryLevel", value);
            }
        },
        wetLevel: {
            get: function () {
                return this.wet.gain;
            },
            set: function (value) {
                this.wet.gain.value = this.verify("wetLevel", value);
                this.wet.gain = this.verify("wetLevel", value);
            }
        },
        buffer: {
            enumerable: false,
            get: function () {
                return this.convolver.buffer;
            },
            set: function (impulse) {
                var convolver = this.convolver,
                    xhr = new XMLHttpRequest();
                if(!impulse) {
                    DMAF.error("DMAF.AudioNodes.Convolver.setBuffer: Missing impulse path!");
                    return;
                }
                xhr.open("GET", impulse, true);
                xhr.responseType = "arraybuffer";
                xhr.onreadystatechange = function () {
                    if(xhr.readyState === 4) {
                        if(xhr.status < 300 && xhr.status > 199 || xhr.status === 302) {
                            DMAF.context.decodeAudioData(xhr.response, function (buffer) {
                                convolver.buffer = buffer;
                            }, function (e) {
                                if(e) DMAF.error("DMAF.AudioNodes.Convolver.setBuffer: Error decoding data" + e);
                            });
                        }
                    }
                };
                xhr.send(null);
            }
        }
    });
    //---------------------------------------------------------------------------------//
    DMAF.AudioNodes.Delay = function (properties) {
        //Instantiate AudioNodes
        this.input = DMAF.context.createGain();
        this.activateNode = DMAF.context.createGain();
        this.dry = DMAF.context.createGain();
        this.wet = DMAF.context.createGain();
        this.filter = DMAF.context.createBiquadFilter();
        this.delay = DMAF.context.createDelay();
        this.feedbackNode = DMAF.context.createGain();
        this.output = DMAF.context.createGain();

        //Connect the AudioNodes
        this.activateNode.connect(this.delay);
        this.activateNode.connect(this.dry);
        this.delay.connect(this.filter);
        this.filter.connect(this.feedbackNode);
        this.feedbackNode.connect(this.delay);
        this.feedbackNode.connect(this.wet);
        this.wet.connect(this.output);
        this.dry.connect(this.output);

        //Set properties
        this.defaults = DMAF.Descriptors.type.audioNode.delay;
        this.tempoSync = properties.tempoSync;
        if(this.tempoSync) {
            this.subdivision = properties.subdivision;
        }
        this.delayTime = properties.delayTime;
        this.feedback = properties.feedback;
        this.wetLevel = properties.wetLevel;
        this.dryLevel = properties.dryLevel;
        this.cutoff = properties.cutoff;
        this.filter.type = "highpass";
    };
    DMAF.AudioNodes.Delay.prototype = Object.create(Super, {
        name: {
            value: "Delay"
        },
        tempoListener: {
            value: function (value) {
                this.tempo = value;
                this.delayTime = this.tempo;
            }
        },
        tempoSync: {
            get: function () {
                return this._tempoSync;
            },
            set: function (value) {
                if(value && typeof value === "string") {
                    var player = DMAF.ProcessorManager.getActiveInstance(value);
                    if(player) {
                        this.tempo = player.tempo;
                    } else {
                        this.tempo = 90;
                    }
                    this._tempoSync = value;
                    //TODO: Fix this now that DMAF doesn't have internal events.
                    dmaf.addEventListener("tempo_" + this._tempoSync, this.tempoListener.bind(this));
                } else {
                    this._tempoSync = false;
                }
            }
        },
        subdivision: {
            get: function () {
                return this._subdivision;
            },
            set: function (value) {
                this._subdivision = this.verify("subdivision", value);
            }
        },
        tempo: {
            get: function () {
                return this._tempo;
            },
            set: function (value) {
                this._tempo = value;
            }
        },
        delayTime: {
            enumerable: true,
            get: function () {
                return this.delay.delayTime;
            },
            set: function (value) {
                if(this._tempoSync) {
                    this.delay.delayTime.value = this.verify("delayTime", 60 * delayConstants[this.subdivision] / this.tempo);
                } else {
                    this.delay.delayTime.value = this.verify("delayTime", value) / 1000;
                }
            }
        },
        wetLevel: {
            enumerable: true,
            get: function () {
                return this.wet.gain;
            },
            set: function (value) {
                this.wet.gain.value = this.verify("wetLevel", value);
            }
        },
        dryLevel: {
            enumerable: true,
            get: function () {
                return this.dry.gain;
            },
            set: function (value) {
                this.dry.gain.value = this.verify("dryLevel", value);
            }
        },
        feedback: {
            enumerable: true,
            get: function () {
                return this.feedbackNode.gain;
            },
            set: function (value) {
                this.feedbackNode.gain.value = this.verify("feedback", value);
            }
        },
        cutoff: {
            enumerable: true,
            get: function () {
                return this.filter.frequency;
            },
            set: function (value) {
                this.filter.frequency.value = this.verify("cutoff", value);
            }
        }
    });
    //---------------------------------------------------------------------------------//
    DMAF.AudioNodes.EnvelopeFollower = function (properties) {
        this.input = DMAF.context.createGain(), this.jsNode = this.output = DMAF.context.createScriptProcessor(this.buffersize, 1, 1);

        this.input.connect(this.output);

        // keep this not to reallocate the mix each time
        // when object is connected to a stereo source abs(in) -> max(abs(ins))
        // this.mixBuffer = new Float32Array(this.buffersize);
        this.defaults = DMAF.Descriptors.type.audioNode.envelopeFollower;
        this.attackTime = properties.attackTime;
        this.releaseTime = properties.releaseTime;
        this._envelope = 0;
        this.target = properties.target;
        this.callback = properties.callback;
    };
    DMAF.AudioNodes.EnvelopeFollower.prototype = Object.create(Super, {
        name: {
            value: "EnvelopeFollower"
        },
        buffersize: {
            value: 256
        },
        envelope: {
            value: 0
        },
        sampleRate: {
            value: 44100
        },
        attackTime: {
            enumerable: true,
            get: function () {
                return this._attackTime;
            },
            set: function (value) {
                this._attackTime = this.verify("attackTime", value);
                this._attackC = Math.exp(-1 / this._attackTime * this.sampleRate / this.buffersize);
            }
        },
        releaseTime: {
            enumerable: true,
            get: function () {
                return this._releaseTime;
            },
            set: function (value) {
                this._releaseTime = this.verify("releaseTime", value);
                this._releaseC = Math.exp(-1 / this._releaseTime * this.sampleRate / this.buffersize);
            }
        },
        callback: {
            get: function () {
                return this._callback;
            },
            set: function (value) {
                if(typeof value === "function") {
                    this._callback = value;
                } else {
                    DMAF.error(this.name + ": Callback must be a function! TypeError: ", value);
                }
            }
        },
        target: {
            get: function () {
                return this._target;
            },
            set: function (value) {
                if(typeof value === "object") {
                    this._target = value;
                } else {
                    DMAF.error(this.name + ": Callback must be an AudioParam interface! TypeError: ", value);
                }
            }
        },
        activate: {
            value: function (doActivate) {
                this.activated = doActivate;
                if(doActivate) {
                    this.jsNode.connect(DMAF.context.destination);
                    this.jsNode.onaudioprocess = this.returnCompute(this);
                } else {
                    this.jsNode.disconnect();
                    this.jsNode.onaudioprocess = null;
                }
            }
        },
        returnCompute: {
            value: function (instance) {
                return function (event) {
                    instance.compute(event);
                };
            }
        },
        compute: {
            value: function (event) {
                var count = event.inputBuffer.getChannelData(0).length,
                    channels = event.inputBuffer.numberOfChannels,
                    current, chan, rms, i;
                chan = rms = 0;
                if(channels > 1) { // need to mixdown
                    for(i = 0; i < count; ++i) {
                        for(; chan < channels; ++chan) {
                            current = event.inputBuffer.getChannelData(chan)[i];
                            rms += (current * current) / channels;
                        }
                    }
                } else {
                    for(i = 0; i < count; ++i) {
                        current = event.inputBuffer.getChannelData(0)[i];
                        rms += (current * current);
                    }
                }
                rms = Math.sqrt(rms);

                if(this._envelope < rms) {
                    this._envelope *= this._attackC;
                    this._envelope += (1 - this._attackC) * rms;
                } else {
                    this._envelope *= this._releaseC;
                    this._envelope += (1 - this._releaseC) * rms;
                }
                this._callback(this._target, this._envelope);
            }
        }
    });
    //---------------------------------------------------------------------------------//
    //Equalizer currently non-functional
    DMAF.AudioNodes.Equalizer = (function () {
        var propertyNames = ["frequency", "gain", "Q", "type"];

        function Equalizer(properties) {

            this._defaults = DMAF.Descriptors.type.audioNode.equalizer;
            this.nbands = properties.bands.length;

            for(var i = 0, ii = this._nbands; i < ii; i++) {
                //addBand.call(this, i);
            }

            this.input = DMAF.context.createGain();
            this.output = DMAF.context.createGain();
            //this.activateNode = this.bands[0];
            this.activateNode = DMAF.context.createGain();
            //TODO:
            //Rework equalizer to work with descriptors.
            return;
            /*//Connect the AudioNodes
             this.connectInOrder(this.bands);
             this.bands[this.nbands - 1].connect(this.output);

             //Set properties for each band
             for (i = 0; i < this._nbands; i++) {
                 for (var j = 0, jj = propertyNames.length; j < jj; j++) {
                     var current = "band" + i + ":" + propertyNames[j];
                     this[current] = properties[current];
                 }
             }*/
        }

        function addBandParam(i, param) {
            var access = "band" + i + ":" + param;
            Object.defineProperty(this, access, {
                enumerable: true,
                get: function () {
                    return this.bands[i][param];
                },
                set: function (value) {
                    if(param === "type") {
                        this.bands[i][param] = this.verify(param, value);
                    } else {
                        this.bands[i][param].value = this.verify(param, value);
                    }
                }
            });
            this.defaults[access] = this._defaults[param];
        }

        function addBand(i) {
            this.bands[i] = DMAF.context.createBiquadFilter();
            addBandParam.apply(this, [i, "frequency"]);
            addBandParam.apply(this, [i, "type"]);
            addBandParam.apply(this, [i, "gain"]);
            addBandParam.apply(this, [i, "Q"]);
        }
        return Equalizer;
    })();
    DMAF.AudioNodes.Equalizer.prototype = Object.create(Super, {
        name: {
            value: "Equalizer"
        },
        propertySearch: {
            value: /:bypass|:type|:frequency|:gain|:q/i
        }
    });
    //---------------------------------------------------------------------------------//
    DMAF.AudioNodes.LFO = (function () {
        function LFO(properties) {
            //Instantiate AudioNode
            this.output = DMAF.context.createScriptProcessor(256, 1, 1);
            this.activateNode = DMAF.context.destination;

            //Set Properties
            this.defaults = DMAF.Descriptors.type.audioNode.lfo;
            this.type = properties.type; //Currently not used
            this.frequency = properties.frequency;
            this.offset = properties.offset;
            this.oscillation = properties.oscillation;
            this.phase = properties.phase;
            this.target = properties.target;
            this.output.onaudioprocess = this.callback(properties.callback);
        }

        LFO.prototype = Object.create(Super, {
            name: {
                value: "LFO"
            },
            bufferSize: {
                value: 256
            },
            sampleRate: {
                value: 44100
            },
            type: {
                enumerable: true,
                get: function () {
                    return this._type;
                },
                set: function (value) {
                    this._type = this.verify("type", value);
                }
            },
            frequency: {
                get: function () {
                    return this._frequency;
                },
                set: function (value) {
                    this._frequency = this.verify("frequency", value);
                    this._phaseInc = 2 * Math.PI * this._frequency * this.bufferSize / this.sampleRate;
                }
            },
            offset: {
                get: function () {
                    return this._offset;
                },
                set: function (value) {
                    this._offset = this.verify("offset", value);
                }
            },
            oscillation: {
                get: function () {
                    return this._oscillation;
                },
                set: function (value) {
                    this._oscillation = this.verify("oscillation", value);
                }
            },
            phase: {
                get: function () {
                    return this._phase;
                },
                set: function (value) {
                    this._phase = this.verify("phase", value);
                }
            },
            target: {
                get: function () {
                    return this._target;
                },
                set: function (value) {
                    this._target = value;
                }
            },
            activate: {
                value: function (doActivate) {
                    this._activated = doActivate;
                    if(!doActivate) {
                        this.output.disconnect(DMAF.context.destination);
                    } else {
                        this.output.connect(DMAF.context.destination);
                    }
                }
            },
            callback: {
                value: function (callback) {
                    var that = this;
                    return function () {
                        that._phase += that._phaseInc;
                        if(that._phase > 2 * Math.PI) {
                            that._phase = 0;
                        }
                        callback(that._target, that._offset + that._oscillation * Math.sin(that._phase));
                    };
                }
            }
        });
        return LFO;
    })();
    //---------------------------------------------------------------------------------//
    DMAF.AudioNodes.Overdrive = function (properties) {
        //Instantiate AudioNodes
        this.input = DMAF.context.createGain();
        this.activateNode = DMAF.context.createGain();
        this.inputDrive = DMAF.context.createGain();
        this.waveshaper = DMAF.context.createWaveShaper();
        this.outputDrive = DMAF.context.createGain();
        this.output = DMAF.context.createGain();

        //Connect AudioNodes
        this.activateNode.connect(this.inputDrive);
        this.inputDrive.connect(this.waveshaper);
        this.waveshaper.connect(this.outputDrive);
        this.outputDrive.connect(this.output);

        //Set Properties
        this.defaults = DMAF.Descriptors.type.audioNode.overdrive;
        this.ws_table = new Float32Array(this.k_nSamples);
        this.drive = properties.drive;
        this.outputGain = properties.outputGain;
        this.curveAmount = properties.curveAmount;
        this.algorithm = properties.algorithmIndex;
    };
    DMAF.AudioNodes.Overdrive.prototype = Object.create(Super, {
        name: {
            value: "Overdrive"
        },
        k_nSamples: {
            value: 8192
        },
        drive: {
            get: function () {
                return this.inputDrive.gain;
            },
            set: function (value) {
                this._drive = this.verify("drive", value);
            }
        },
        curveAmount: {
            get: function () {
                return this._curveAmount;
            },
            set: function (value) {
                this._curveAmount = this.verify("curveAmount", value);
                if(this._algorithmIndex === undefined) {
                    this._algorithmIndex = 0;
                }
                this.waveshaperAlgorithms[this._algorithmIndex](this._curveAmount, this.k_nSamples, this.ws_table);
                this.waveshaper.curve = this.ws_table;
            }
        },
        outputGain: {
            get: function () {
                return this.outputDrive.gain;
            },
            set: function (value) {
                var temp = this.verify("outputGain", value);
                this._outputGain = DMAF.Utils.dbToWAVolume(temp);
            }
        },
        algorithm: {
            get: function () {
                return this._algorithmIndex;
            },
            set: function (value) {
                this._algorithmIndex = this.verify("algorithmIndex", value);
                this.curveAmount = this._curveAmount;
            }
        },
        waveshaperAlgorithms: {
            value: [

            function (amount, n_samples, ws_table) {
                var k = 2 * amount / (1 - amount),
                    i, x;
                for(i = 0; i < n_samples; i++) {
                    x = i * 2 / n_samples - 1;
                    ws_table[i] = (1 + k) * x / (1 + k * Math.abs(x));
                }
            }, function (amount, n_samples, ws_table) {
                var i, x, y;
                for(i = 0; i < n_samples; i++) {
                    x = i * 2 / n_samples - 1;
                    y = ((0.5 * Math.pow((x + 1.4), 2)) - 1) * y >= 0 ? 5.8 : 1.2;
                    ws_table[i] = DMAF.Utils.tanh(y);
                }
            }, function (amount, n_samples, ws_table) {
                var i, x, y, a = 1 - amount;
                for(i = 0; i < n_samples; i++) {
                    x = i * 2 / n_samples - 1;
                    y = x < 0 ? -Math.pow(Math.abs(x), a + 0.04) : Math.pow(x, a);
                    ws_table[i] = DMAF.Utils.tanh(y * 2);
                }
            }, function (amount, n_samples, ws_table) {
                var i, x, y, abx, a = 1 - amount > 0.99 ? 0.99 : 1 - amount;
                for(i = 0; i < n_samples; i++) {
                    x = i * 2 / n_samples - 1;
                    abx = Math.abs(x);
                    if(abx < a) y = abx;
                    else if(abx > a) y = a + (abx - a) / (1 + Math.pow((abx - a) / (1 - a), 2));
                    else if(abx > 1) y = abx;
                    ws_table[i] = DMAF.Utils.sign(x) * y * (1 / ((a + 1) / 2));
                }
            }, function (amount, n_samples, ws_table) { // fixed curve, amount doesn't do anything, the distortion is just from the drive
                var i, x;
                for(i = 0; i < n_samples; i++) {
                    x = i * 2 / n_samples - 1;
                    if(x < -0.08905) {
                        ws_table[i] = (-3 / 4) * (1 - (Math.pow((1 - (Math.abs(x) - 0.032857)), 12)) + (1 / 3) * (Math.abs(x) - 0.032847)) + 0.01;
                    } else if(x >= -0.08905 && x < 0.320018) {
                        ws_table[i] = (-6.153 * (x * x)) + 3.9375 * x;
                    } else {
                        ws_table[i] = 0.630035;
                    }
                }
            }, function (amount, n_samples, ws_table) {
                var a = 2 + Math.round(amount * 14),
                    // we go from 2 to 16 bits, keep in mind for the UI
                    bits = Math.round(Math.pow(2, a - 1)),
                    // real number of quantization steps divided by 2
                    i, x;
                for(i = 0; i < n_samples; i++) {
                    x = i * 2 / n_samples - 1;
                    ws_table[i] = Math.round(x * bits) / bits;
                }
            }]
        }
    });
    //---------------------------------------------------------------------------------//
    DMAF.AudioNodes.PingPongDelay = function (properties) {
        this.input = DMAF.context.createGain();
        this.activateNode = DMAF.context.createGain();
        this.dry = DMAF.context.createGain();
        this.splitter = DMAF.context.createChannelSplitter(2);
        this.toMono = DMAF.context.createGain();
        this.wet = DMAF.context.createGain();
        this.feedbackNode = DMAF.context.createGain();
        this.delayL = new DMAF.AudioNodes.Delay(properties);
        this.delayR = new DMAF.AudioNodes.Delay(properties);
        this.merger = DMAF.context.createChannelMerger();
        this.output = DMAF.context.createGain();

        this.activateNode.connect(this.dry);
        this.activateNode.connect(this.splitter);
        this.splitter.connect(this.toMono, 0, 0);
        this.splitter.connect(this.toMono, 1, 0);
        this.toMono.connect(this.wet);
        this.wet.connect(this.delayL.delay);
        this.feedbackNode.connect(this.delayL.delay);
        this.delayL.delay.connect(this.delayR.delay);
        this.delayR.delay.connect(this.feedbackNode);
        this.delayL.delay.connect(this.merger, 0, 0);
        this.delayR.delay.connect(this.merger, 0, 1);
        this.dry.connect(this.output);
        this.merger.connect(this.output);

        //Set Properties
        this.delayL.feedback = 0;
        this.delayR.feedback = 0;
        this.delayL.wetLevel = 1;
        this.delayR.wetLevel = 1;
        this.delayL.dryLevel = 0;
        this.delayR.dryLevel = 0;

        this.defaults = DMAF.Descriptors.type.audioNode.pingPongDelay;
        this.cutoff = properties.cutoff;
        this.tempoSync = properties.tempoSync;
        if(this.tempoSync) {
            this.subdivision = properties.subdivision;
        }
        this.delayTime = properties.delayTime;
        this.feedback = properties.feedback;
        this.wetLevel = properties.wetLevel;
        this.dryLevel = properties.dryLevel;
    };
    DMAF.AudioNodes.PingPongDelay.prototype = Object.create(Super, {
        name: {
            value: "PingPongDelay"
        },
        tempoSync: {
            get: function () {
                return this._tempoSync;
            },
            set: function (value) {
                var player = DMAF.ProcessorManager.getActiveInstance(value);
                if(player) {
                    this.tempo = player.tempo;
                } else {
                    this.tempo = 120;
                }
                this._tempoSync = this.verify("tempoSync", value);
                this.delayL.tempoSync = this._tempoSync;
                this.delayR.tempoSync = this._tempoSync;
            }
        },
        tempo: {
            get: function () {
                return this._tempo;
            },
            set: function (value) {
                this._tempo = value;
                this.delayL.tempo = value;
                this.delayR.tempo = value;
            }
        },
        subdivision: {
            get: function () {
                return this._subdivision;
            },
            set: function (value) {
                this._subdivision = this.verify("subdivision", value);
                this.delayL.subdivision = this._subdivision;
                this.delayR.subdivision = this._subdivision;
            }
        },
        delayTime: {
            enumerable: true,
            get: function () {
                return this._delayTime;
            },
            set: function (value) {
                if(this._tempoSync) {
                    this._delayTime = this.verify("delayTime", 60 * delayConstants[this.subdivision] / this.tempo);
                    this.delayL.delayTime = this._delayTime;
                    this.delayR.delayTime = this._delayTime;
                } else {
                    this._delayTime = this.verify("delayTime", value) / 1000;
                    this.delayL.delayTime = value;
                    this.delayR.delayTime = value;
                }
            }
        },
        wetLevel: {
            enumerable: true,
            get: function () {
                return this.wet.gain;
            },
            set: function (value) {
                this.wet.gain.value = this.verify("wetLevel", value);
            }
        },
        dryLevel: {
            enumerable: true,
            get: function () {
                return this.dry.gain;
            },
            set: function (value) {
                this.dry.gain.value = this.verify("dryLevel", value);
            }
        },
        feedback: {
            enumerable: true,
            get: function () {
                return this.feedbackNode.gain;
            },
            set: function (value) {
                this.feedbackNode.gain.value = this.verify("feedback", value);
            }
        },
        cutoff: {
            enumerable: true,
            get: function () {
                return this.filter.frequency;
            },
            set: function (value) {
                this.delayL.filter.frequency.value = this.verify("cutoff", value);
                this.delayR.filter.frequency.value = this.verify("cutoff", value);
            }
        }
    });
    //---------------------------------------------------------------------------------//
    DMAF.AudioNodes.Phaser = function (properties) {
        //Instantiate AudioNodes
        this.input = DMAF.context.createGain();
        this.splitter = this.activateNode = DMAF.context.createChannelSplitter(2);
        this.filtersL = [];
        this.filtersR = [];
        this.feedbackGainNodeL = DMAF.context.createGain();
        this.feedbackGainNodeR = DMAF.context.createGain();
        this.merger = DMAF.context.createChannelMerger(2);
        this.filteredSignal = DMAF.context.createGain();
        this.output = DMAF.context.createGain();
        this.lfoL = new DMAF.AudioNodes.LFO({
            target: this.filtersL,
            callback: this.callback
        });
        this.lfoR = new DMAF.AudioNodes.LFO({
            target: this.filtersR,
            callback: this.callback
        });

        //Instantiate Left and Right Filter AudioNode Arrays
        var i = this.stage;
        while(i--) {
            this.filtersL[i] = DMAF.context.createBiquadFilter();
            this.filtersR[i] = DMAF.context.createBiquadFilter();
            this.filtersL[i].type = "allpass";
            this.filtersR[i].type = "allpass";
        }
        //Connect Nodes
        this.input.connect(this.splitter);
        this.input.connect(this.output);
        this.splitter.connect(this.filtersL[0], 0, 0);
        this.splitter.connect(this.filtersR[0], 1, 0);
        this.connectInOrder(this.filtersL);
        this.connectInOrder(this.filtersR);
        this.filtersL[this.stage - 1].connect(this.feedbackGainNodeL);
        this.filtersL[this.stage - 1].connect(this.merger, 0, 0);
        this.filtersR[this.stage - 1].connect(this.feedbackGainNodeR);
        this.filtersR[this.stage - 1].connect(this.merger, 0, 1);
        this.feedbackGainNodeL.connect(this.filtersL[0]);
        this.feedbackGainNodeR.connect(this.filtersR[0]);
        this.merger.connect(this.output);

        //Set Values
        this.defaults = DMAF.Descriptors.type.audioNode.phaser;
        this.rate = properties.rate;
        this.baseModulationFrequency = properties.baseModulationFrequency;
        this.depth = properties.depth;
        this.feedback = properties.feedback;
        this.stereoPhase = properties.stereoPhase;

        //Activate LFOs
        this.lfoL.activate(true);
        this.lfoR.activate(true);
    };
    DMAF.AudioNodes.Phaser.prototype = Object.create(Super, {
        name: {
            value: "Phaser"
        },
        stage: {
            value: 4
        },
        callback: {
            value: function (filters, value) {
                for(var stage = 0; stage < 4; stage++) {
                    filters[stage].frequency.value = value;
                }
            }
        },
        depth: {
            enumerable: true,
            get: function () {
                return this._depth;
            },
            set: function (value) {
                this._depth = this.verify("depth", value);
                this.lfoL.oscillation = this._baseModulationFrequency * this._depth;
                this.lfoR.oscillation = this._baseModulationFrequency * this._depth;
            }
        },
        rate: {
            enumerable: true,
            get: function () {
                return this._rate;
            },
            set: function (value) {
                this._rate = this.verify("rate", value);
                this.lfoL.frequency = this._rate;
                this.lfoR.frequency = this._rate;
            }
        },
        baseModulationFrequency: {
            enumerable: true,
            get: function () {
                return this._baseModulationFrequency;
            },
            set: function (value) {
                this._baseModulationFrequency = this.verify("baseModulationFrequency", value);
                this.lfoL.offset = this._baseModulationFrequency;
                this.lfoR.offset = this._baseModulationFrequency;
                this._depth = this.verify("depth", this._depth);
            }
        },
        feedback: {
            get: function () {
                return this._feedback;
            },
            set: function (value) {
                this._feedback = this.verify("feedback", value);
                this.feedbackGainNodeL.gain.value = this._feedback;
                this.feedbackGainNodeR.gain.value = this._feedback;
            }
        },
        stereoPhase: {
            get: function () {
                return this._stereoPhase;
            },
            set: function (value) {
                this._stereoPhase = this.verify("stereoPhase", value);
                var newPhase = this.lfoL._phase + this._stereoPhase * Math.PI / 180;
                newPhase = DMAF.Utils.fmod(newPhase, 2 * Math.PI);
                this.lfoR._phase = newPhase;
            }
        }
    });
    //---------------------------------------------------------------------------------//
    DMAF.AudioNodes.Tremolo = function (actionProperties) {
        //Instantiate AudioNodes
        this.input = DMAF.context.createGain();
        this.splitter = this.activateNode = DMAF.context.createChannelSplitter(2), this.amplitudeL = DMAF.context.createGain(), this.amplitudeR = DMAF.context.createGain(), this.merger = DMAF.context.createChannelMerger(2), this.output = DMAF.context.createGain();
        this.lfoL = new DMAF.AudioNodes.LFO({
            target: this.amplitudeL.gain,
            callback: pipe
        });
        this.lfoR = new DMAF.AudioNodes.LFO({
            target: this.amplitudeR.gain,
            callback: pipe
        });

        //Connect AudioNodes
        this.input.connect(this.splitter);
        this.splitter.connect(this.amplitudeL, 0);
        this.splitter.connect(this.amplitudeR, 1);
        this.amplitudeL.connect(this.merger, 0, 0);
        this.amplitudeR.connect(this.merger, 0, 1);
        this.merger.connect(this.output);

        //Set Values
        this.defaults = DMAF.Descriptors.type.audioNode.tremolo;
        this.rate = actionProperties.rate;
        this.intensity = actionProperties.intensity;
        this.stereoPhase = actionProperties.stereoPhase;

        //Set LFO Values
        this.lfoL.offset = 1 - (this.intensity / 2);
        this.lfoR.offset = 1 - (this.intensity / 2);
        this.lfoL.phase = this.stereoPhase * Math.PI / 180;

        //Activate LFOs
        this.lfoL.activate(true);
        this.lfoR.activate(true);
    };
    DMAF.AudioNodes.Tremolo.prototype = Object.create(Super, {
        name: {
            value: "Tremolo"
        },
        intensity: {
            enumerable: true,
            get: function () {
                return this._intensity;
            },
            set: function (value) {
                this._intensity = this.verify("intensity", value);
                this.lfoL.offset = this._intensity / 2;
                this.lfoR.offset = this._intensity / 2;
                this.lfoL.oscillation = this._intensity;
                this.lfoR.oscillation = this._intensity;
            }
        },
        rate: {
            enumerable: true,
            get: function () {
                return this._rate;
            },
            set: function (value) {
                this._rate = this.verify("rate", value);
                this.lfoL.frequency = this._rate;
                this.lfoR.frequency = this._rate;
            }
        },
        steroPhase: {
            enumerable: true,
            get: function () {
                return this._rate;
            },
            set: function (value) {
                this._stereoPhase = this.verify("stereoPhase", value);
                var newPhase = this.lfoL._phase + this._stereoPhase * Math.PI / 180;
                newPhase = DMAF.Utils.fmod(newPhase, 2 * Math.PI);
                this.lfoR.phase = newPhase;
            }
        }
    });
    //---------------------------------------------------------------------------------//
    DMAF.AudioNodes.WahWah = function (properties) {
        //Instantiate AudioNodes
        this.input = DMAF.context.createGain();
        this.activateNode = DMAF.context.createGain();
        this.envelopeFollower = new DMAF.AudioNodes.EnvelopeFollower({
            target: this,
            callback: function (context, value) {
                context.sweep = value;
            }
        });
        this.filterBp = DMAF.context.createBiquadFilter();
        this.filterPeaking = DMAF.context.createBiquadFilter();
        this.output = DMAF.context.createGain();

        //Connect AudioNodes
        this.activateNode.connect(this.filterBp);
        this.filterBp.connect(this.filterPeaking);
        this.filterPeaking.connect(this.output);

        //Set Properties
        this.defaults = DMAF.Descriptors.type.audioNode.wahWah;
        this.init();
        this.automode = properties.enableAutoMode;
        this.resonance = properties.resonance;
        this.sensitivity = properties.sensitivity;
        this.baseFrequency = properties.baseModulationFrequency;
        this.excursionOctaves = properties.excursionOctaves;
        this.sweep = properties.sweep;

        this.envelopeFollower.activate(true);
    };
    DMAF.AudioNodes.WahWah.prototype = Object.create(Super, {
        name: {
            value: "WahWah"
        },
        activateCallback: {
            value: function (value) {
                this.automode = value;
            }
        },
        automode: {
            get: function () {
                return this._automode;
            },
            set: function (value) {
                this._automode = value;
                if(value) {
                    this.activateNode.connect(this.envelopeFollower.input);
                    this.envelopeFollower.activate(true);
                } else {
                    this.envelopeFollower.activate(false);
                    this.activateNode.disconnect();
                    this.activateNode.connect(this.filterBp);
                }
            }
        },
        sweep: {
            enumerable: true,
            get: function () {
                return this._sweep.value;
            },
            set: function (value) {
                this._sweep = Math.pow(value > 1 ? 1 : value < 0 ? 0 : value, this._sensitivity);
                this.filterBp.frequency.value = this._baseFrequency + this._excursionFrequency * this._sweep;
                this.filterPeaking.frequency.value = this._baseFrequency + this._excursionFrequency * this._sweep;
            }
        },
        baseFrequency: {
            enumerable: true,
            get: function () {
                return this._baseFrequency;
            },
            set: function (value) {
                this._baseFrequency = 50 * Math.pow(10, this.verify("baseFrequency", value) * 2);
                this._excursionFrequency = Math.min(this.sampleRate / 2, this.baseFrequency * Math.pow(2, this._excursionOctaves));
                this.filterBp.frequency.value = this._baseFrequency + this._excursionFrequency * this._sweep;
                this.filterPeaking.frequency.value = this._baseFrequency + this._excursionFrequency * this._sweep;
            }
        },
        excursionOctaves: {
            enumerable: true,
            get: function () {
                return this._excursionOctaves;
            },
            set: function (value) {
                this._excursionOctaves = this.verify("excursionOctaves", value);
                this._excursionFrequency = Math.min(this.sampleRate / 2, this.baseFrequency * Math.pow(2, this._excursionOctaves));
                this.filterBp.frequency.value = this._baseFrequency + this._excursionFrequency * this._sweep;
                this.filterPeaking.frequency.value = this._baseFrequency + this._excursionFrequency * this._sweep;
            }
        },
        sensitivity: {
            enumerable: true,
            get: function () {
                return this._sensitivity;
            },
            set: function (value) {
                this._sensitivity = this.verify("sensitivity", value);
                this._sensitivity = Math.pow(10, this._sensitivity);
            }
        },
        resonance: {
            enumerable: true,
            get: function () {
                return this._resonance;
            },
            set: function (value) {
                this._resonance = this.verify("resonance", value);
                this.filterPeaking.Q = this._resonance;
            }
        },
        init: {
            value: function () {
                var keys = Object.keys(this.defaults),
                    i, ii;
                this.output.gain.value = 5;
                this.filterPeaking.type = "peaking";
                this.filterBp.type = "bandpass";
                this.filterPeaking.frequency.value = 100;
                this.filterPeaking.gain.value = 20;
                this.filterPeaking.Q.value = 5;
                this.filterBp.frequency.value = 100;
                this.filterBp.Q.value = 1;
                this.sampleRate = DMAF.context.sampleRate;
                for(i = 0, ii = keys.length; i < ii; i++) {
                    this[keys[i]] = this.defaults[keys[i]].value;
                }
            }
        }
    });
});
dmaf.once("load_Processors", function (DMAF) {
    var ops = {
            "==": function (a, b) {
                return a == b;
            },
            "!=": function (a, b) {
                return a != b;
            },
            ">": function (a, b) {
                return a > b;
            },
            "<": function (a, b) {
                return a < b;
            },
            ">=": function (a, b) {
                return a >= b;
            },
            "<=": function (a, b) {
                return a <= b;
            },
            "||": function (a, b) {
                return a || b;
            },
            "&&": function (a, b) {
                return a && b;
            },
            "%": function (a, b) {
                return a % b;
            },
            "*": function (a, b) {
                return a * b;
            },
            "/": function (a, b) {
                return a / b;
            },
            "+": function (a, b) {
                return a + b;
            },
            "-": function (a, b) {
                return a - b;
            }
        };

    DMAF.ProcessorManager = {
        activeProcessors: {},
        name: "ProcessorManager",
        addInstance: function (instance) {
            this.activeProcessors[instance.instanceId] = instance;
        },
        removeInstance: function (instance) {
            var result = !! this.activeProcessors[instance.instanceId];
            if (result) {
                delete this.activeProcessors[instance.instanceId];
                DMAF.debug("removing transformProcessor ID:" + instance.instanceId + " with target " + instance.target + " from ProcessorManager.activeProcessors.");
            } else {
                DMAF.error("ProcessorManager.removeProcessor: Processor ID: " + instance.instanceId + " is not in activeProcessors array!");
            }
            return result;
        },
        getActiveInstance: function (instanceId) {
            return this.activeProcessors[instanceId] || false;
        },
        getProcessorByType: function (type) {
            var keys = Object.keys(this.activeProcessors),
                result = [],
                key;
            for (var i = 0; (key = keys[i++]);) {
                if (this.activeProcessors[key].type === type) {
                    result.push(this.activeProcessors[key]);
                }
            }
            return !!result[0] && result;
        }
    };
    DMAF.Processor = {};
    DMAF.Processor.EventPropertyMap = function (properties) {
        var keys = Object.keys(properties),
            key, i;
        for (i = 0; (key = keys[i++]);) {
            this[key] = properties[key];
        }
    };
    DMAF.Processor.EventPropertyMap.prototype = Object.create({}, {
        onAction: {
            value: function (trigger, actionTime, eventProperties, actionProperties) {
                if (eventProperties === undefined) {
                    return;
                }
                if (eventProperties[this.propertyName] !== undefined) {
                    for (var i = 0, ii = this.maps.length; i < ii; i++) {
                        if (eventProperties[this.propertyName] == this.maps[i].inValue || eventProperties[this.propertyName] == "any") {
                            var temp = DMAF.Utils.fromString(this.typeOut, this.maps[i].outValue);
                            if (/[:]/.test(temp)) {
                                temp = DMAF.Utils.DynamicValueRetriever.getTargetProperty(temp, trigger);
                            }
                            eventProperties[this.propertyName] = temp;
                        }
                    }
                }
            }
        }
    });
    DMAF.Processor.EventStop = function (properties) {
        var keys = Object.keys(properties),
            key, i;
        for (i = 0; (key = keys[i++]);) {
            this[key] = properties[key];
        }
    };
    DMAF.Processor.EventStop.prototype = Object.create({}, {
        onAction: {
            value: function (trigger, actionTime, eventProperties, actionProperties) {
                var leftOperand = DMAF.Utils.DynamicValueRetriever.getTargetProperty(this.leftOperand, trigger),
                    rightOperand = DMAF.Utils.DynamicValueRetriever.getTargetProperty(this.rightOperand, trigger);
                leftOperand = DMAF.Utils.fromString(this.leftType, leftOperand);
                rightOperand = DMAF.Utils.fromString(this.rightType, rightOperand);

                var result = ops[this.operator](leftOperand, rightOperand);
                if (result) {
                    DMAF.ActionManager.stop();
                }
            }
        }
    });
    DMAF.Processor.Transform = function (properties) {
        this.timeoutContainer = [];
        this.instanceId = DMAF.Utils.createUID();
        for (var key in properties) {
            this[key] = properties[key];
        }
    };
    DMAF.Processor.Transform.prototype = Object.create({}, {
        type: {
            value: "TRANSFORM"
        },
        onAction: {
            value: function (trigger, actionTime, eventProperties) {
                this.actionTime = actionTime;
                if (this.targets.length === 1) {
                    for (var i = 0, ii = this.targets.length; i < ii; i++) {
                        this.target = trigger.replace(this.multiSuffix, "");
                    }
                    DMAF.Clock.checkFunctionTime(this.actionTime, this.execute, this.timeoutContainer, this);
                } else if (this.targets.length > 1) {
                    if (this.multiSuffix) {
                        DMAF.error("DMAF transformProcessor error: You cannot use multiSuffix with multiple targets.");
                    }
                    DMAF.Clock.checkFunctionTime(this.actionTime, this.executeList, this.timeoutContainer, this);
                } else {
                    DMAF.error("DMAF transformProcessor error: No targets present. Please check the config.xml");
                }
            }
        },
        executeList: {
            value: function (actionTime) {
                var i = this.targets.length;
                while (i--) {
                    this.target = this.targets[i];
                    this.targets.pop();
                    this.execute();
                }
            }
        },
        execute: {
            value: function () {
                var target = DMAF.Utils.DynamicValueRetriever.getTargetInstance(this.targetType + ":" + this.target),
                    property, chain;

                if (!target) {
                    return;
                }
                chain = this.targetParameter.split(":");
                if (chain.length === 1 || chain[1].substring(0, 4) == "band") {
                    target.setAutomatableProperty(chain[0], this.value, this.duration, this.actionTime);
                } else {
                    property = target.getAutomatableProperties(chain[0]);
                    for (var i = 1; i < chain.length - 1; i++) {
                        property = property.getAutomatableProperties(chain[i]);
                    }
                    property.setAutomatableProperty(chain[chain.length - 1], this.value, this.duration);
                }
                if (this.targets.length === 0) {
                    DMAF.ProcessorManager.removeInstance(this);
                }
            }
        }
    });
    DMAF.Processor.MacroProcessor = function (properties) {
        this.targetPropertyArray = properties.targets;
    };
    DMAF.Processor.MacroProcessor.prototype = Object.create({}, {
        type: {
            value: "MACRO"
        },
        onAction: {
            value: function (trigger, actionTime, eventProperties) {
                var targetProperties, finalValue, property, target, chain;
                this.value = eventProperties.value;
                this.actionTime = actionTime;
                for (var i = 0, ii = this.targetPropertyArray.length; i < ii; i++) {
                    targetProperties = this.targetPropertyArray[i];
                    target = DMAF.Utils.DynamicValueRetriever.getTargetInstance(targetProperties.targetType + ":" + targetProperties.targetId);
                    if (!target) {
                        continue;
                    }
                    chain = targetProperties.targetParameter.split(":");
                    finalValue = targetProperties.minValue + (targetProperties.maxValue - targetProperties.minValue) * this.value;
                    if (chain.length == 1) {
                        target.setAutomatableProperty(chain[0], finalValue, this.duration, this.actionTime);
                    } else {
                        property = target.getAutomatableProperties(chain[0]);
                        for (var j = 1; j < chain.length - 1; j++) {
                            property = property.getAutomatableProperties(chain[j]);
                        }
                        property.setAutomatableProperty(chain[chain.length - 1], finalValue, this.duration, this.actionTime);
                    }
                }
            }
        }
    });
});dmaf.once("load_BeatPattern", function (DMAF) {
    
    DMAF.Processor.BeatPatternInstance = function (player, properties) {
        if (!properties.beatPattern) {
            //console.error("Found no BeatPattern for channel", properties.channel, ". Please check MIDI file.");
            this.ERROR = true;
            return;
        }
        this.addAtSongPosition = properties.addAtSongPosition;
        this.currentBeat = properties.startPatternAtBeat;
        this.replaceActive = properties.replaceActive;
        this.clearPosition = properties.clearPosition;
        this.setAsCurrent = properties.setAsCurrent;
        this.beatPattern = properties.beatPattern;
        this.patternId = properties.patternId;
        this.channel = properties.channel;
        this.loop = properties.loop;
        this.player = player;

        if (this.loop) {
            if (properties.loopLength) {
                this.loopLength = properties.loopLength;
                this.removeAtSongPosition = new DMAF.Processor.BeatPosition(Infinity, 1, this.player.beatsPerBar);
            } else {
                //console.error("You must specify a loopLength for pattern " + this.patternId + " if loop is set to true.");
            }
            if (this.currentBeat === this.loopLength) {
                //console.log(this.currentBeat);
                this.currentBeat = 1;
            }
        } else {
            this.removeAtSongPosition = clonePosition(this.addAtSongPosition);
            var offsetInBeats = this.beatPattern.endPosition - this.currentBeat;
            this.removeAtSongPosition.addOffset({
                bar: 0,
                beats: offsetInBeats
            });
        }
    };
    DMAF.Processor.BeatPatternInstance.prototype = {
        gotoNextBeat: function () {
            this.currentBeat++;
            if (this.loop && this.currentBeat > this.loopLength) {
                this.currentBeat = 1;
            }
        },
        executeEvents: function (eventTime, beatLength) {
            var events = this.beatPattern.events[this.currentBeat];
            if (!events) {
                return;
            }
            for (var i = 0, ii = events.length; i < ii; i++) {
                events[i].execute(eventTime, beatLength);
            }
        }
    };

    //////////////////////////////////////////
    DMAF.Processor.BeatPattern = function (patternId, startPosition) {
        this.events = {};
        this.patternId = patternId;
        this.startPosition = startPosition || 1;
        this.endPosition = 0;
    };

    DMAF.Processor.BeatPattern.prototype = {
        addEvent: function (eventName, beat, tick, data) {
            this.events[beat] = this.events[beat] || [];
            this.events[beat].push(new SynthEvent(eventName, beat, tick, data));
            if (beat + 1 > this.endPosition) {
                this.endPosition = beat + 1;
            }
        }
    };

    //////////////////////////////////////////
    DMAF.Processor.BeatPosition = function (bar, beat, beatsPerBar) {
        this.bar = bar === undefined ? 1 : bar;
        this.beat = beat === undefined ? 1 : beat;
        this.beatsPerBar = beatsPerBar === undefined ? 16 : beatsPerBar;
    };

    DMAF.Processor.BeatPosition.prototype = {
        getInBeats: function () {
            return ((this.bar - 1) * this.beatsPerBar) + this.beat;
        },
        gotoNextBeat: function () {
            if (this.beat === this.beatsPerBar) {
                this.bar++;
                this.beat = 1;
            } else {
                this.beat++;
            }
        },
        addOffset: function (offset) {
            this.beat += offset.beat;
            while (this.beat > this.beatsPerBar) {
                this.bar++;
                this.beat -= this.beatsPerBar;
            }
            this.bar += offset.bar;
        }
    };
    //////////////////////////////////////////
    function SynthEvent(eventName, beat, tick, data) {
        this.eventName = eventName;
        this.beat = beat;
        this.tick = tick || 1;
        this.data = data;
    }
    SynthEvent.prototype.execute = function (eventTime, beatLength) {
        var data = Object.create(this.data);
        //add the tick time to the start time
        eventTime = ~~ (eventTime + ((this.tick - 1) * (beatLength / 120)));
        //start time plus the difference in ticks, converted to time, between the start time and the next occuring noteOff
        data.duration = (eventTime + ((data.duration * (beatLength / 120)) / 1000)) - eventTime;
        data.duration *= 1000;
        DMAF.MainController(this.eventName, eventTime, data);
    };

    function clonePosition(position) {
        return new DMAF.Processor.BeatPosition(position.bar, position.beat, this.player.beatsPerBar);
    }
});
dmaf.once("load_BeatPatternPlayer", function (DMAF) {
    DMAF.Processor.BeatPatternPlayer = function (actionProperties) {
        this.instanceId = actionProperties.instanceId;
        this.state = this.STOPPED;
        this.pendingPatterns = [];
        this.activePatterns = [];
        this.tempo = 120;
        this.songPosition = new DMAF.Processor.BeatPosition(0, 16, 16);
        this.currentPattern = new DMAF.Processor.BeatPatternInstance(this, {
            beatPattern: new DMAF.Processor.BeatPattern('master', 1),
            channel: "master",
            addAtSongPosition: new DMAF.Processor.BeatPosition(1, 1, 16),
            patternStartPosition: 1,
            clearPending: true,
            replaceActive: true,
            setAsCurrent: true,
            loop: true,
            loopLength: 16,
            clearPosition: new DMAF.Processor.BeatPosition(1, 1, 16)
        });
    };
    DMAF.Processor.BeatPatternPlayer.prototype = Object.create({}, {
        STOPPED: {
            value: 0
        },
        RUNNING: {
            value: 1
        },
        tempo: {
            get: function () {
                return this._tempo;
            },
            set: function (value) {
                this._tempo = value;
                this.beatLength = (60 / value) * 250;
                //TODO: Fix this now that DMAF doesn't have internal events.
                dmaf.dispatch("tempo_" + this.instanceId, this._tempo);
            }
        },
        dispatch: {
            value: function (actionTime) {
                if (this.songPosition.beat % this._dispatchBeat === 1) {
                    //console.log("BEAT scheduled for", actionTime + DMAF.serverOffset);
                    DMAF.Clock.checkFunctionTime(actionTime, DMAF.MainController, [], DMAF, "beat", actionTime, this.songPosition);
                }
            }
        },
        dispatchBeat: {
            get: function () {
                return this._dispatchBeat;
            },
            set: function (value) {
                switch (value) {
                case "BAR":
                    this._dispatchBeat = this.beatsPerBar + 1;
                    break;
                case "QUARTER":
                    this._dispatchBeat = 4;
                    break;
                case "EIGHTH":
                    this._dispatchBeat = 2;
                    break;
                case "SIXTEENTH":
                    this._dispatchBeat = 1;
                    break;
                case "NONE":
                    this._dispatchBeat = 0;
                    break;
                default:
                    DMAF.error("DMAF BeatPatternPlayer: Unrecognized dispatch beat " + this._dispatchBeat);
                }
            }
        },
        onAction: {
            value: function (trigger, actionTime, eventProperties, actionProperties) {
                if (actionProperties.flowItems) {
                    var flow = actionProperties.flowItems,
                        flowItem;
                    this.dispatchBeat = actionProperties.dispatchBeat;
                    this.dispatchDelay = actionProperties.dispatchDelay;
                    for (var i = 0, ii = flow.length; i < ii; i++) {
                        flowItem = DMAF.Utils.objClone(flow[i]);
                        //TODO: bring me up to speed on this
                        if (flowItem.patternId === "trigger") {
                            flowItem.patternId = trigger;
                        }
                        switch (flowItem.id) {
                            case "start":
                                this.start(flowItem, actionTime, eventProperties);
                                break;
                            case "add":
                                DMAF.Clock.checkFunctionTime(actionTime, this.addPattern, [], this, flowItem);
                                break;
                            case "stop":
                                this.stop(flowItem.songPosition);
                        }
                    }
                }
            }
        },
        addPattern: {
            value: function (properties) {
                if (this.state === this.RUNNING) {
                    properties.beatPattern = DMAF.AssetsManager.getBeatPattern(properties.patternId);
                    properties.addAtSongPosition = this.getSongPosition(properties.songPosition);
                    properties.startPatternAtBeat = this.getStartAtBeat(properties.patternPosition);
                    properties.clearPosition = this.getSongPosition(properties.clearPosition);
                    var beatPatternInstance = new DMAF.Processor.BeatPatternInstance(this, properties);
                    if (properties.clearPending) {
                        if (properties.channel === "main") {
                            this.pendingPatterns.length = 0;
                        } else {
                            var i = this.pendingPatterns.length;
                            while (i--) {
                                if (this.pendingPatterns[i].channel === properties.channel) {
                                    this.pendingPatterns.splice(i, 1);
                                }
                            }
                        }
                    }
                    if (!beatPatternInstance.ERROR) {
                        this.pendingPatterns.push(beatPatternInstance);
                    }
                } else {
                    DMAF.debug("BeatPatternPlayer: Cannot add pattern while player is not running.", properties.patternId);
                }
            }
        },
        checkBeat: {
            value: function () {
                var currentTime = DMAF.context.currentTime * 1000;

                while (currentTime - this.nextBeatTime - DMAF.preListen > this.beatLength) {
                    this.skipBeat(this.nextBeatTime);
                }
                while (currentTime >= this.nextBeatTime - DMAF.preListen) {
                    this.updateBeat(this.nextBeatTime);
                }
            }
        },
        skipBeat: {
            value: function (eventTime) {
                this.songPosition.gotoNextBeat();
                this.nextBeatTime = eventTime + this.beatLength;
                for (var i = 0, ii = this.activePatterns.length; i < ii; i++) {
                    this.activePatterns[i].gotoNextBeat();
                }
                this.updateActivePatterns();
            }
        },
        updateBeat: {
            value: function (eventTime) {
                if(DMAF.compensateContextTime){
                    this.nextBeatTime = eventTime + this.beatLength - checkDifference();
                } else {
                    this.nextBeatTime = eventTime + this.beatLength;
                }
                this.songPosition.gotoNextBeat();
                for (var i = 0, ii = this.activePatterns.length; i < ii; i++) {
                    this.activePatterns[i].gotoNextBeat();
                }
                this.updateActivePatterns();
                for (i = 0, ii = this.activePatterns.length; i < ii; i++) {
                    this.activePatterns[i].executeEvents(eventTime, this.beatLength);
                }
                if (this._dispatchBeat) {
                    this.dispatch(eventTime);
                }
            }
        },
        updateActivePatterns: {
            value: function () {
                var i = this.pendingPatterns.length,
                    instanceToActivate, removePosition, clearPosition, addPosition, j, jj;
                while (i--) {
                    addPosition = this.pendingPatterns[i].addAtSongPosition;
                    if (addPosition.bar === this.songPosition.bar && addPosition.beat === this.songPosition.beat) {
                        instanceToActivate = this.pendingPatterns[i];
                        this.pendingPatterns.splice(i, 1);
                        if (instanceToActivate.replaceActive) {
                            for (j = 0, jj = this.activePatterns.length; j < jj; j++) {
                                if (instanceToActivate.channel === "main" || instanceToActivate.channel === this.activePatterns[j].channel) {
                                    this.activePatterns[j].removeAtSongPosition = instanceToActivate.clearPosition;
                                }
                            }
                        }
                        if (instanceToActivate.setAsCurrent) {
                            this.currentPattern = instanceToActivate;
                        }
                        this.activePatterns.push(instanceToActivate);
                    }
                }
                i = this.activePatterns.length;
                while (i--) {
                    removePosition = this.activePatterns[i].removeAtSongPosition;
                    if (removePosition.bar === this.songPosition.bar && removePosition.beat === this.songPosition.beat) {
                        this.activePatterns.splice(i, 1);
                    }
                }
            }
        },
        start: {
            value: function (flowItem, actionTime, eventProperties) {
                //console.log("START", actionTime, eventProperties);
                if (this.state === this.RUNNING) {
                    //console.log("ALREADY RUNNING!");
                    return;
                }
                var tempo, songPosition;
                if (eventProperties) {
                    tempo = eventProperties.tempo;
                    songPosition = eventProperties.songPosition || eventProperties.position;
                }
                tempo = tempo ? tempo : flowItem.tempo;
                songPosition = songPosition ? songPosition : {
                    bar: 0,
                    beat: 16,
                    beatsPerBar: 16
                };
                //if (actionTime < DMAF.context.currentTime * 1000) {
                //    console.log("actionTime recieved in beatPatternPlayer was before currentTime.");
                //    console.log("currentTime", DMAF.context.currentTime * 1000);
                //    console.log("actionTime", actionTime);
                //}
                actionTime = actionTime || DMAF.context.currentTime * 1000;
                
                this.tempo = tempo;
                this.nextBeatTime = actionTime;
                this.beatsPerBar = songPosition.beatsPerBar;
                this.songPosition = new DMAF.Processor.BeatPosition(songPosition.bar, songPosition.beat, songPosition.beatsPerBar);
                DMAF.Clock.addFrameListener("checkBeat", this.checkBeat, this);
                this.state = this.RUNNING;
            }
        },
        stop: {
            value: function (songPosition) {
                var position = this.getSongPosition(songPosition).getInBeats(),
                    current = this.songPosition.getInBeats(),
                    time = (position - current) * this.beatLength;
                time += DMAF.context.currentTime * 1000;
                if (time < 0) {
                    time = 0;
                }
                DMAF.Clock.checkFunctionTime(time, this.proceedStop, [], this);
            }
        },
        proceedStop: {
            value: function () {
                this.state = this.STOPPED;
                this.pendingPatterns.length = 0;
                this.activePatterns.length = 0;
                this.songPosition = new DMAF.Processor.BeatPosition(0, this.beatsPerBar, this.beatsPerBar);
                DMAF.Clock.removeFrameListener("checkBeat");
                firstTime = true;
            }
        },
        getSongPosition: {
            value: function (string) {
                var mode = string,
                    position = new DMAF.Processor.BeatPosition(this.songPosition.bar, this.songPosition.beat, this.beatsPerBar);
                switch (mode) {
                case "NEXT_BEAT":
                    position.addOffset({
                        bar: 0,
                        beat: 1
                    });
                    break;
                case "NEXT_BAR":
                    position.beat = 1;
                    position.bar++;
                    break;
                    case "ASAP":
                        //do it now!
                        return position;
                default:
                    DMAF.error("BeatPatternPlayer getSongPosition: Unrecognized songPosition ", position);
                }
                return position;
            }
        },
        getStartAtBeat: {
            value: function (string) {
                var mode = string,
                    beat = this.currentPattern.currentBeat || 1;
                if (!mode) {
                    return;
                }
                switch (mode) {
                case "FIRST_BEAT":
                    beat = 1;
                    break;
                case "SYNC":
                    beat++;
                    break;
                default:
                    DMAF.error("BeatPatternPlayer: Unrecognized patternPosition " + mode);
                }
                return beat;
            }
        }
    });
    function checkDifference () {
        var jsTime = new Date().getTime(),
            contextTime = DMAF.context.currentTime * 1000,
            difference, change;
        if (firstTime) {
            checkDifference.referenceDifference = jsTime - contextTime;
            checkDifference.errorCounter = 0;
            firstTime = false;
        }
        difference = jsTime - contextTime;
        change = difference - checkDifference.referenceDifference;
        if(Math.abs(change) > 10){
            checkDifference.errorCounter++;
            if(checkDifference.errorCounter >= 5){
                //console.log(">>>> Adjusting next beat Time. Difference was " + change + "ms");
                checkDifference.referenceDifference = difference;
                checkDifference.errorCounter = 0;
                //console.log("resetting diff counter");
                return change;
            } else {
                //console.log("Got bad diff. Total bad diffs:", checkDifference.errorCounter);
                return 0;
            }
        } else {
            checkDifference.errorCounter = 0;
            //console.log("resetting diff counter");
            return 0;
        }
    }
    var firstTime = true;
});
dmaf.once("load_Synth", function (DMAF) {
    var has = "hasOwnProperty",
        mToF = DMAF.Utils.MIDIToFrequency,
        toMidi = DMAF.Utils.toMIDINote,
        dbToWAV = DMAF.Utils.dbToWAVolume;

    DMAF.SynthManager = Object.create(null, {
        activeInstances: {
            value: {}
        },
        sampleMaps: {
            value: {}
        },
        addInstance: {
            value: function (instance, id) {
                if (!this.activeInstances[instance.instanceId]) {
                    this.activeInstances[instance.instanceId] = instance;
                }
            }
        },
        removeInstance: {
            value: function (instance) {
                delete this.activeInstances[instanceId];
            }
        },
        getActiveInstance: {
            value: function (instanceId) {
                return this.activeInstances[instanceId] || false;
            }
        },
        getSampleMap: {
            value: function (instanceId) {
                return this.sampleMaps[instanceId] || false;
            }
        }
    });

    DMAF.Synth = {};
    DMAF.Synth.SynthInstance = (function () {
        function SynthInstance(instanceProperties) {
            var samplesToLoad = [];
            this.input = DMAF.context.createGain();
            this.output = DMAF.context.createGain();
            this.defaults = DMAF.Descriptors.action.synth.synthInstance;
            this.verify = DMAF.Utils.verify;
            routeInternalEffects.apply(this, [instanceProperties.output, instanceProperties.audioNodes, instanceProperties.bus]);
            this.volume = instanceProperties.volume;
            this.ignoreNoteOff = instanceProperties.ignoreNoteOff;
            this.instanceId = instanceProperties.instanceId;
            this.loop = instanceProperties.loop;
            this._sustain = false;
            this.SynthNote = getNoteClass.apply(this, [instanceProperties]);
            this.samples = {
                meta: Object.create(null),
                maps: Object.create(null),
                used: Object.create(null),
                active: Object.create(null),
                sustained: []
            };
            //Get samples to load & Populate usedSamples object
            for (var i = 0, ii = instanceProperties.sampleMapGroups[0].sampleMaps.length; i < ii; i++) {
                //Need to fix this
                this.samples.meta[instanceProperties.sampleMapGroups[0].sampleMaps[i].name] = instanceProperties.sampleMapGroups[0].sampleMaps[i];
            }
            for (var mapName in this.samples.meta) {
                this.samples.maps[mapName] = DMAF.SynthManager.getSampleMap(mapName);
                this.samples.used[mapName] = Object.create(null);
                for (var range in this.samples.maps[mapName]) {
                    if (!DMAF.AssetsManager.loadedSounds[this.samples.maps[mapName][range].sound]) {
                        samplesToLoad.push(this.samples.maps[mapName][range].sound);
                    }
                }
            }

            //Load Samples & initialize garbage collection for notes
            if (samplesToLoad.length) {
                DMAF.AssetsManager.preloadSamples(samplesToLoad, this.instanceId);
            }
            DMAF.Clock.addFrameListener(this.instanceId, disposeCheck, this);
        }
        SynthInstance.prototype = Object.create({}, {
            ampAttack: {
                get: function () {
                    return this.SynthNote.prototype.ampAttack;
                },
                set: function (value) {
                    this.SynthNote.prototype.ampAttack = this.verify(this.defaults.ampAttack, value, "ampAttack");
                }
            },
            ampDecay: {
                get: function () {
                    return this.SynthNote.prototype.ampDecay;
                },
                set: function (value) {
                    this.SynthNote.prototype.ampDecay = this.verify(this.defaults.ampDecay, value, "ampDecay");
                }
            },
            ampSustain: {
                get: function () {
                    return this.SynthNote.prototype.ampSustain;
                },
                set: function (value) {
                    this.SynthNote.prototype.ampSustain = this.verify(this.defaults.ampSustain, value, "ampSustain");
                }
            },
            ampRelease: {
                get: function () {
                    return this.SynthNote.prototype.ampRelease;
                },
                set: function (value) {
                    this.SynthNote.prototype.ampRelease = this.verify(this.defaults.ampRelease, value, "ampRelease");
                }
            },
            filterAttack: {
                get: function () {
                    return this.SynthNote.prototype.filterAttack;
                },
                set: function (value) {
                    this.SynthNote.prototype.filterAttack = this.verify(this.defaults.filterAttack, value, "filterAttack");
                }
            },
            filterDecay: {
                get: function () {
                    return this.SynthNote.prototype.filterDecay;
                },
                set: function (value) {
                    this.SynthNote.prototype.filterDecay = this.verify(this.defaults.filterAttack, value, "filterAttack");
                }
            },
            filterSustain: {
                get: function () {
                    return this.SynthNote.prototype.filterSustain;
                },
                set: function (value) {
                    this.SynthNote.prototype.filterSustain = this.verify(this.defaults.filterSustain, value, "filterSustain");
                }
            },
            filterRelease: {
                get: function () {
                    return this.SynthNote.prototype.filterRelease;
                },
                set: function (value) {
                    this.SynthNote.prototype.filterRelease = this.verify(this.defaults.filterRelease, value, "filterRelease");
                }
            },
            filterFrequency: {
                get: function () {
                    return this.SynthNote.prototype.filterFrequency;
                },
                set: function (value) {
                    this.SynthNote.prototype.filterFrequency = this.verify(this.defaults.filterFrequency, value, "filterFrequency");
                }
            },
            ignoreNoteOff: {
                get: function () {
                    return this._ignoreNoteOff;
                },
                set: function (value) {
                    this._ignoreNoteOff = this.verify(this.defaults.ignoreNoteOff, value, "ignoreNoteOff");
                }
            },
            volume: {
                get: function () {
                    return this.output.gain.value;
                },
                set: function (value) {
                    var reset = (value === "reset"),
                        level = this.verify(this.defaults.volume, value, "volume");
                    this.output.gain.value = reset ? this.baseVolume : DMAF.Utils.dbToWAVolume(value);
                }
            },
            loop: {
                get: function () {
                    return this._loop;
                },
                set: function (value) {
                    this._loop = this.verify(this.defaults.loop, value, "loop");
                }
            },
            sustain: {
                get: function () {
                    return this._sustain;
                },
                set: function (value) {
                    if (value) {
                        this._sustain = true;
                    } else {
                        this._sustain = false;
                        for (var i = 0, ii = this.samples.sustained.length; i < ii; i++) {
                            this.samples.sustained[i]._noteOff(DMAF.context.currentTime * 1000);
                        }
                    }
                }
            },
            controller: {
                value: function (eventProperties) {
                    switch (message.cc) {
                    case 64:
                        this.sustain = this.verify("sustain", message.value);
                        break;
                    default:
                        DMAF.debug("Unknow controller message " + JSON.stringify(message));
                    }
                }
            },
            getAutomatableProperty: {
                value: function (property) {
                    if (property.substring(0, 2) === "fx") {
                        return this.effects[parseInt(property.substring(2), 10)].effectNode;
                    }
                }
            },
            onAction: {
                value: function (trigger, actionTime, eventProperties) {
                    if (!eventProperties) {
                        return;
                    }
                    if (this[eventProperties.type]) {
                        this[eventProperties.type](actionTime, eventProperties);
                    } else {
                        //console.log("Synth does not recognize message ", eventProperties);
                    }
                }
            },
            getRange: {
                value: function (midiNote, velocity) {
                    var meta = this.samples.meta,
                        maps = this.samples.maps,
                        used = this.samples.used,
                        sampleIndex = 0,
                        possible = [],
                        mapToUse, mapName, ranges, range, highEnd, lowend;

                    for (mapName in meta) {
                        if (meta[mapName].velocityLow <= velocity && meta[mapName].velocityHigh >= velocity) {
                            mapToUse = maps[mapName];
                            for (ranges in mapToUse) {
                                range = mapToUse[ranges];
                                if (midiNote >= toMidi(range.low) && midiNote <= toMidi(range.hi)) {
                                    possible.push(range);
                                }
                            }
                        }
                    }
                    if (possible.length !== 1) {
                        if (used[mapName][midiNote] !== undefined) {
                            sampleIndex = (used[mapName][midiNote] + 1) % possible.length;
                        }
                        used[mapName][midiNote] = sampleIndex;
                    }
                    return possible[sampleIndex];
                }
            },
            noteOn: {
                value: function (actionTime, eventProperties) {
                    var active = this.samples.active,
                        midiNote = eventProperties.midiNote,
                        velocity = eventProperties.velocity,
                        duration = eventProperties.duration || eventProperties.endTime,
                        range = this.getRange(midiNote, velocity),
                        note;
                    //If not in range..
                    if (range && range.sound) { //or sample is not loaded...
                        if (DMAF.AssetsManager.getBuffer(range.sound) === "loading" || !DMAF.AssetsManager.getBuffer(range.sound)) {
                            return;
                        }
                    } else {
                        return;
                    }
                    //Create a new note
                    note = new this.SynthNote({
                        parent: this,
                        sampleGain: range.vol,
                        baseNote: range.root,
                        buffer: range.sound,
                        midiNote: midiNote,
                        velocity: velocity
                    });
                    //Call noteOff for any conflicting notes
                    if (active[midiNote]) {
                        if (active[midiNote].length && !this.ignoreNoteOff) {
                            this.noteOff(actionTime, eventProperties);
                        }
                    } else {
                        active[midiNote] = []; //If no array in the samples.active object, create one
                    }
                    if (this.loop && this.ignoreNoteOff) {
                        //console.log("SynthInstance Configuration Error: You cannot use looped samples with ignoreNoteOff.");
                        if (eventProperties.duration) {
                            this.ignoreNoteOff = false;
                        } else {
                            this.loop = false;
                        }
                    }
                    //Play the note
                    note._noteOn(actionTime);

                    //Determine noteOff Method
                    setNoteOff.apply(this, [note, actionTime, duration]);
                }
            },
            noteOff: {
                value: function (actionTime, eventProperties) {
                    var active = this.samples.active,
                        sustained = this.samples.sustained,
                        note = eventProperties.midiNote, i, ii;
                    if (!note || this.ignoreNoteOff) {
                        return;
                    }
                    if (active[note]) {
                        for (i = 0, ii = active[note].length; i < ii; i++) {
                            active[note][i]._noteOff(actionTime || DMAF.context.currentTime * 1000);
                        }
                    }
                    if (this.sustain) {
                        return;
                    }
                    for (i = 0, ii = sustained.length; i < ii; i++) {
                        if (sustained[i].midiNote === note) {
                            sustained[i]._noteOff(actionTime || DMAF.context.currentTime * 1000);
                        }
                    }
                }
            },
            stopAll: {
                value: function (eventProperties) {
                    var active = this.samples.active,
                        sustained = this.samples.sustained,
                        i;
                    for (var array in active) {
                        i = active[array].length;
                        while (i--) {
                            active[array][i]._noteOff(DMAF.context.currentTime);
                        }
                        i = sustained.length;
                        while (i--) {
                            sustained[i]._noteOff(DMAF.context.currentTime);
                        }
                    }
                }
            },
            setAutomatableProperty: {
                value: function (property, value, actionTime, duration) {
                    if (property in this.defaults) {
                        this[property] = value;
                    }
                }
            }
        });

        function routeInternalEffects(output, effects, bus) {
            if (output) {
                this.input.connect(this.output);
                this.output.connect(output);
            } else {
                var lastNode = this.input;
                this.effects = DMAF.Utils.createEffectsRecursive(lastNode, effects);
                if (this.effects.length > 0) {
                    lastNode = this.effects[this.effects.length - 1];
                }
                lastNode.connect(this.output);
                if (!bus || bus === "master") {
                    this.output.connect(DMAF.context.master);
                } else {
                    try {
                        this.output.connect(DMAF.AudioBusManager.getActiveInstance(bus).input);
                    } catch (e) {
                        //console.group("SYNTH CONNECTION TYPE ERROR");
                        //console.log("There was an error connecting the output of " + this.instanceId + " to the specified bus");
                        //console.log("Bus is: ", bus);
                        //console.log("Bus in processorManager: ", DMAF.AudioBusManager.getActiveInstance(bus));
                        //console.log("Throwing error object back out...");
                        //console.groupEnd();
                        //throw (e);
                    }

                }
            }
        }

        function disposeCheck() {
            var currentTime = DMAF.context.currentTime,
                active = this.samples.active,
                sustained = this.samples.sustained,
                i;
            for (var array in active) {
                i = active[array].length;
                while (i--) {
                    if (active[array][i].disposeTime <= currentTime) {
                        active[array].splice(i, 1);
                    }
                }
            }
            i = sustained.length;
            while (i--) {
                if (sustained[i].disposeTime <= currentTime) {
                    sustained.splice(i, 1);
                }
            }
        }

        function setNoteOff(note, actionTime, duration) {
            var unknownDuration = this._loop && this._sustain,
                defaultDuration = this._loop ? Infinity : note.bufferLength * 1000 - note.ampRelease,
                adjustedDuration = this.ignoreNoteOff ? defaultDuration : duration ? duration : defaultDuration,
                noteOffTime = actionTime + (unknownDuration ? Infinity : adjustedDuration);
            if (isFinite(noteOffTime)) {
                note._noteOff(noteOffTime);
            }
            if (this.sustained || !duration) {
                this.samples.sustained.push(note);
                if (this.samples.sustained.length > this.numberOfVoices) {
                    this.samples.sustained[0]._noteOff(DMAF.context.currentTime * 1000);
                }
            } else {
                this.samples.active[note.midiNote].push(note);
            }
        }

        function getNoteClass(properties) {
            function SynthNote(properties) {
                //Instantiate Audionodes
                this.bufferSource = DMAF.context.createBufferSource();
                this.ampADSR = DMAF.context.createGain();
                this.filter = this.filterOn && DMAF.context.createBiquadFilter();

                //Connect AudioNodes
                this.bufferSource.connect(this.filter || this.ampADSR);
                if (this.filter) {
                    this.filter.connect(this.ampADSR);
                }
                this.ampADSR.connect(this.output);
                //Set Properties
                this.parent = properties.parent;
                this.midiNote = properties.midiNote;
               //this.bufferSource.gain.value = properties.sampleGain !== undefined ? dbToWAV(parseInt(properties.sampleGain, 10)) : 1;
                this.bufferSource.playbackRate.value = mToF(this.midiNote) / mToF(toMidi(properties.baseNote));
                this.bufferSource.buffer = DMAF.AssetsManager.getBuffer(properties.buffer);
                this.bufferLength = this.bufferSource.buffer.length / DMAF.context.sampleRate;
                this.velocity = Math.pow(properties.velocity / 127, 1.2);
                this.bufferSource.loop = this.parent.loop;
                if (this.filterOn) {
                    this.filter.Q.value = this.filterQ;
                    this.filter.gain = this.filterGain;
                }
            }
            var defaults = NotePrototype.defaults,
                value;
            SynthNote.prototype = Object.create(NotePrototype);
            for (var name in defaults) {
                if (properties[name] !== undefined) {
                    SynthNote.prototype[name] = properties[name];
                }
            }
            SynthNote.prototype.output = this.input;
            SynthNote.prototype.filterSustain = Math.pow(SynthNote.prototype.filterSustain, 4);
            return SynthNote;
        }
        var NotePrototype = {
            defaults: {
                ampAttack: 0,
                ampDecay: 0.01,
                ampSustain: 1,
                ampRelease: 0.01,
                ampVelocityRatio: 1,
                filterAttack: 0,
                filterRelease: 0.01,
                filterDecay: 0.01,
                filterSustain: 1,
                filterFrequency: 0,
                filterADSRAmount: 1,
                filterVelocityRatio: 0,
                filterGain: 0,
                filterType: 0,
                filterOn: false,
                filterQ: 0,
                midiNote: 64,
                velocity: undefined,
                sampleGain: undefined,
                stopped: false
            },
            ATTACK: "attack",
            DECAY: "decay",
            SUSTAIN: "sustain",
            RELEASE: "release",
            PEAK_VAL: "PeakValue",
            SUS_VAL: "SustainValue",
            REL_PROP: {
                amp: "gain",
                filter: "frequency"
            },
            _getReleaseValue: function (noteOffTime, type) {
                var now = DMAF.context.currentTime,
                    noteTime = this.noteOnTime,
                    normalized, range;
                switch (true) {
                case (now <= (noteTime += this[type + this.ATTACK])):
                    return ((noteTime - now) / this[type + this.ATTACK]) * this[type + this.PEAK_VAL];
                case (now <= (noteTime += this[type + this.DECAY])):
                    return ((noteTime - now) / (this[type + this.ATTACK] + this[type + this.DECAY])) * (this[type + this.PEAK_VAL] - this[type + this.SUS_VAL]);
                case (now <= noteOffTime):
                    return this[type + this.SUS_VAL];
                default:
                    if (type === "amp") {
                        type += "ADSR";
                    }
                    return this[type][this.REL_PROP[type]].value;
                }
                return normalized * range;
            },
            _noteOn: function (noteOnTime) {
                //Get Amp Envelope
                var ampAttackTime = noteOnTime + this.ampAttack,
                    ampDecayTime = ampAttackTime + this.ampDecay,
                    ampPeak = 1 - this.ampVelocityRatio + this.velocity * this.ampVelocityRatio,
                    ampSustain = Math.pow((this.ampSustain * ampPeak), 2);

                this.noteOnTime = noteOnTime;
                this.ampPeakValue = ampPeak;
                this.ampSustainValue = ampSustain;

                //Set Amp Envelope
                this.ampADSR.gain.setValueAtTime(0, noteOnTime / 1000); //initial zero value
                this.ampADSR.gain.linearRampToValueAtTime(ampPeak, ampAttackTime / 1000); //attack
                this.ampADSR.gain.linearRampToValueAtTime(ampSustain, ampDecayTime); //decay
                //If Filter, get Filter Envelope
                if (this.filterOn) {
                    var filterAttackTime = noteOnTime + this.filterAttack,
                        filterDecayTime = filterAttackTime + this.filterDecay,
                        filterVelocity = 1 - this.filterVelocityRatio + this.velocity * this.filterVelocityRatio,
                        adsrPeakFrequency = this.filterADSRAmount * filterVelocity,
                        totalPeakFrequency = this.filterFrequency + adsrPeakFrequency,
                        sustainFrequency = this.filterFrequency + (this.filterSustain * adsrPeakFrequency);

                    totalPeakFrequency = mToF((totalPeakFrequency * 12) + this.midiNote);
                    sustainFrequency = mToF((sustainFrequency * 12) + this.midiNote);
                    totalPeakFreauency = totalPeakFreauency < 20 ? 20 : totalPeakFreauency > 20000 ? 20000 : totalPeakFreauency;
                    sustainFreauency = sustainFreauency < 20 ? 20 : sustainFreauency > 20000 ? 20000 : sustainFreauency;

                    //Set Filter Envelope
                    this.filterFrequency = mToF((this.filterFrequency * 12) + this.midiNote);
                    this.filter.frequency.setValueAtTime(this.filterFrequency, noteOnTime / 1000); //Init Value
                    this.filter.frequency.linearRampToValueAtTime(totalPeakFrequency, filterAttackTime / 1000); //attack
                    this.filter.frequency.linearRampToValueAtTime(sustainFrequency, filterDecayTime / 1000); //decay
                }

                //Set noteOnTime for noteOff and start the sample playing
                this.bufferSource.start(this.noteOnTime / 1000);
            },
            _noteOff: function (noteOffTime) {
                var ampReleaseTime, filterReleaseTime, oscNoteOffTime;
                //ampReleaseValue = _getReleaseValue(noteOffTime, "amp"),
                //filterReleaseValue = _getReleaseValue(noteOffTime, "filter");
                //Set release times
                ampReleaseTime = noteOffTime + this.ampRelease;
                filterReleaseTime = noteOffTime + this.filterRelease;
                oscNoteOffTime = noteOffTime + this.ampRelease + 0.001; //Prevent possible sample clipping
                //Automate amp release
                this.ampADSR.gain.cancelScheduledValues(noteOffTime / 1000);
                this.ampADSR.gain.setValueAtTime(this.ampADSR.gain.value, noteOffTime / 1000);
                this.ampADSR.gain.linearRampToValueAtTime(0, ampReleaseTime / 1000);
                //Automate Filter release
                if (this.filter) {
                    this.filter.frequency.cancelScheduledValues(noteOffTime / 1000);
                    this.filter.frequency.setValueAtTime(this.filter.frequency.value, noteOffTime / 1000);
                    this.filter.frequency.linearRampToValueAtTime(this.filterFrequency, filterReleaseTime / 1000);
                }

                if(!this.stopped){
                    //Set bufferSource noteOffTime
                    this.bufferSource.stop(oscNoteOffTime / 1000);
                    this.stopped = true;
                }
                //Set disposeTime
                this.disposeTime = oscNoteOffTime / 1000;
            }
        };
        return SynthInstance;
    })();
});
dmaf.once("load_Sounds", function (DMAF) {
    var ctm = DMAF.Clock,
        counter = 0;

    DMAF.Sound = {};
    DMAF.Sound.Super = Object.create(null, {
        dbToWAV: {
            value: DMAF.Utils.dbToWAVolume
        },
        dispose: {
            value: function (id) {
                var s = this.sounds,
                    ii = s.length,
                    playing;
                for (var i = 0; i < ii; i++) {
                    playing = (s[i].playbackState === 2) && true;
                    if (s[i].id === id) {
                        this.sounds.splice(i, 1);
                        ii--;
                    }
                }
                this.playing = !! playing;
            }
        },
        play: {
            value: function (actionTime) {
                //Type conversion/determination here...
                var a = this.reTrig === "true",
                    b = this.reTrig !== "false",
                    c = (actionTime - this.previousActionTime < parseFloat(this.reTrig)),
                    tooSoon = !a && (!b || b && c);

                //Return if sound is playing and reTrig settings or softLoop prevent futher play actions.
                if (this.playing && tooSoon || this.playing && this.softLoop) {
                    return;
                }

                //Keep Reference to last successful play action
                this.previousActionTime = actionTime;

                //Drop pending actions
                ctm.dropPendingArray(this.pendingPlays);
                ctm.dropPendingArray(this.pendingStops);

                //Schedule the action
                ctm.checkFunctionTime(actionTime, this.proceedPlay, this.pendingPlays, this);
            }
        },
        proceedPlay: {
            value: function () {
                var buffer = DMAF.AssetsManager.getBuffer(this.getSoundFile()),
                    currentTime = DMAF.context.currentTime * 1000,
                    sound;

                //If there is no buffer or loading, return.
                if (buffer === false || buffer === "loading") {
                    DMAF.error("SoundGeneric: Buffer is loading or missing. Check soundFile property.");
                    return;
                }

                //Create a new bufferSource
                sound = DMAF.context.createBufferSource();
                sound.buffer = buffer;
                sound.gain.value = this.waVolume;
                sound.connect(this.targetBus);

                //Unique id.
                sound.id = counter++;

                //Hold reference for possible cancel or stop
                this.sounds.push(sound);
                sound.start(0);
                this.playing = true;

                //Set bufferSourceNode dispose time
                ctm.checkFunctionTime(currentTime + 200 + sound.buffer.duration * 1000, this.dispose, [], this, sound.id);

                //If softloop, schedule the next iteration of the loop
                if (this.softLoop) {
                    ctm.checkFunctionTime((currentTime + this.loopLength), this.proceedPlay, this.pendingPlays, this);
                }
            }
        },
        stop: {
            value: function (actionTime) {
                //Cancel pending play actions
                ctm.dropPendingArray(this.pendingPlayArray);
                //Schedule stop action
                ctm.checkFunctionTime(actionTime, this.proceedStop, this.pendingStopArray, this);
            }
        },
        proceedStop: {
            value: function () {
                //Update instance state
                this.playing = false;

                //Remove from manager if necessary to free the reference to the object.
                //Does not free the bufferArray. (Still in assets manager)
                if (this.type === "SOUNDSTEP" || this.softloop) {
                    DMAF.Managers.getSoundManager().removeSoundInstance(this.soundId);
                }

                //Call noteOff on all bufferSourceNodes.
                for (var i = 0, ii = this.sounds.length; i < ii; i++) {
                    this.sounds[i].stop(0);
                }

                //Remove reference to the bufferSourceNodes.
                this.sounds.length = 0;
            }
        },
        //TODO: Determine where value checking should occur.
        verify: {
            value: DMAF.Utils.verify
        },
        volume: {
            get: function () {
                return this._volume;
            },
            set: function (value) {
                this._volume = value;
                this.waVolume = this.dbToWAV(this._volume);
            }
        }
    });
    //------------------------------------------------------------------------------//
    /* *
     * @classDescription SoundGenericPlay
     * @extends DMAF.Actions
     * *
     * Used to access the play method of SoundGeneric type sounds.
     */

    /* *
     * @constructor SoundGenericPlay
     * @param actionProperties {Object} the settings for this action and the settings for the instance.
     * *
     * Sets the soundId for the action/instance and maintains reference to the actionProperties object.
     */
    /*  DMAF.Actions.SoundGenericPlay = function (actionProperties) {
        if (actionProperties.soundId === "multi") {
            this.soundId = actionProperties.trigger;
        } else {
            this.soundId = actionProperties.soundId;
        }
        this.actionProperties = actionProperties;
    }; */
    /* *
     * @prototype SoundGenericPlay
     * *
     * Prototype object containing shared properties and methods for the SoundGenericPlay Action
     * TODO: Move much of this to a Super for all sound Actions to avoid repetition.
     */
    /*    DMAF.Actions.SoundGenericPlay.prototype = Object.create({}, {
        type: {value: "SOUNDGENERIC_PLAY"},
        execute: {
            value: function(eventProperties, trigger, actionTime) {
                //Handle Multi
                if (this.soundId === "multi") {
                    this.soundId = trigger;
                }
                //Check for instance.
                var instance = DMAF.Managers.getSoundManager().getSoundInstance(this.soundId);
                //If no instance, make a new one.
                if (!instance) {
                    //Let's do something about this? We have half the instance constructor in the action.
                    instance = DMAF.Factories.getSoundInstanceFactory().create("GENERIC", this.soundId, this.actionProperties.bus);
                    instance.volume = this.actionProperties.volume;
                    instance.preListen = this.actionProperties.preListen;
                    instance.softLoop = (this.actionProperties.softLoop === "true" || this.actionProperties.softLoop === true);
                    instance.loopLength = this.actionProperties.loopLength;
                    instance.reTrig = this.actionProperties.reTrig;
                    instance.bus = this.actionProperties.bus;
                    instance.soundFile = this.soundId === "multi" ? trigger : this.actionProperties.soundFile;
                    //Add instance to the manager.
                    DMAF.Managers.getSoundManager().addSoundInstance(instance, this.soundId);
                }
                //Call the instance Play method.
                instance.play(actionTime);
            }
        }
    });*/
    //------------------------------------------------------------------------------//
    /* *
     * @classDescription SoundGeneric
     * *
     * Class used to play basic sounds, optional loop and retrigger settings.
     */

    /* *
     * @constructor SoundGeneric
     * @param instanceId {String} Id provided in the config.xml file.
     * @param bus {String} Name of the output bus to use for this sound.
     * @returns {Class} SoundGeneric
     * *
     * Creates a new instance of the SoundGeneric Class.
     */
    DMAF.Sound.SoundGeneric = function (instanceId, bus) {
        this.instanceId = instanceId;
        this.sounds = [];
        this.previousActionTime = 0;
        this.pendingPlays = [];
        this.pendingStops = [];
        if (!bus || bus === "master") {
            this.targetBus = DMAF.context.master;
        } else {
            this.targetBus = DMAF.Managers.getAudioBusManager().getAudioBusInstance(bus).input;
        }
    };
    /* *
     * @prototype SoundGeneric
     */
    DMAF.Sound.SoundGeneric.prototype = Object.create(DMAF.Sound.Super, {
        getSoundFile: {
            value: function () {
                return this.soundFile;
            }
        },
        playing: {
            value: false,
            writable: true
        }
    });
    //------------------------------------------------------------------------------//
    /* *
     * @classDescription SoundStepPlay
     * @extends DMAF.Actions
     * *
     * Class used to access the play method of the SoundStep class.
     */

    /* *
     * @constructor SoundStepPlay
     * @param actionProperties
     * @returns {Class} SoundStepPlay
     * *
     * Sets the soundId for the instance/action and keeps reference to the actionProperties
     */
    /*    DMAF.Actions.SoundStepPlay = function (actionProperties) {
        this.soundId = actionProperties.soundId;
        this.actionProperties = actionProperties;
    };*/
    /* *
     * @prototype SoundStepPlay
     * *
     * Reference to shared methods/properties for all soundStepPlay instances.
     */
    /*    DMAF.Actions.SoundStepPlay.prototype = Object.create({}, {
        type: {value: "SOUNDSTEP_PLAY"},
        execute: {
            value: function(eventProperties, trigger, actionTime) {
                var instance;
                //Get the instance from the manager.
                instance = DMAF.Managers.getSoundManager().getSoundInstance(this.actionProperties.soundId);
                //Create a new instance if one doesn't exist
                if (!instance) {
                    instance = DMAF.Factories.getSoundInstanceFactory().create("STEP", this.actionProperties.soundId, this.actionProperties.bus);
                    instance.iterator = DMAF.Factories.getIteratorFactory().createIterator(this.actionProperties.iterator, this.actionProperties.soundFiles);
                    instance.volume = this.actionProperties.volume;
                    instance.preListen = this.actionProperties.preListen;
                    instance.soundFiles = this.actionProperties.soundFiles;
                    instance.soundId = this.actionProperties.soundId;
                    instance.reTrig = this.actionProperties.reTrig;
                    instance.reTrigType = typeof instance.reTrig;
                    instance.bus = this.actionProperties.bus;
                    DMAF.Managers.getSoundManager().addSoundInstance(instance, this.actionProperties.soundId);
                }
                //Call the play method of the instance.
                instance.play(actionTime);
            }
        }
    });*/
    //------------------------------------------------------------------------------//
    /* *
     * @classDescription SoundStep
     * @extends DMAF.Sound
     * *
     * Class which plays the
     */
    DMAF.Sound.SoundStep = function (soundId, bus) {
        DMAF.Sound.SoundGeneric.apply(this, [soundId, bus]);
    };
    DMAF.Sound.SoundStep.prototype = Object.create(DMAF.Sound.Super, {
        constructor: {
            value: DMAF.Sound.SoundGeneric
        },
        type: {
            value: "SOUNDSTEP"
        },
        getSoundFile: {
            value: function () {
                return this.iterator.getNext();
            }
        }
    });

    //------------------------------------AudioBus------------------------------------
    /*
    DMAF.Actions.AudioBusCreate = function (actionProperties) {
        this.instanceId = actionProperties.instanceId;
        this.actionProperties = actionProperties;
    };

    DMAF.Actions.AudioBusCreate.prototype = Object.create({}, {
        type: {value: "AUDIOBUS_CREATE"},
        execute: {
            value: function(eventProperties, trigger, actionTime) {
                var bus = DMAF.Managers.getAudioBusManager().getAudioBusInstance(this.instanceId);
                // add it to the manager if it doesn't exist already'
                if(!bus) {
                    bus = new DMAF.AudioBus(this.actionProperties);
                    DMAF.Managers.getAudioBusManager().addAudioBusInstance(bus);
                }
            }
        }
    });*/
    DMAF.AudioBusManager = {
        activeInstances: {},
        addInstance: function (instance) {
            if (!this.activeInstances[instance.instanceId]) {
                this.activeInstances[instance.instanceId] = instance;
            }
        },
        removeInstance: function (instanceId) {
            if (this.activeInstances[instanceId]) {
                delete this.activeInstances[instanceId];
            }
        },
        getActiveInstance: function (instanceId) {
            if (this.activeInstances[instanceId]) {
                return this.activeInstances[instanceId];
            } else {
                return false;
            }
        }
    };
    DMAF.Sound.AudioBus = function (properties) {
        this.instanceId = properties.instanceId;
        this.outputBus = properties.output;
        this.volume = properties.volume;
        this.pan = properties.pan; //ignored for now
        this.input = DMAF.context.createGain();
        this.output = DMAF.context.createGain();
        // build the fx chain - the 6 synths will connect to this now
        var lastFx = this.input;
        this.effects = DMAF.Utils.createEffectsRecursive(this.input, properties.audioNodes);
        if (this.effects.length > 0) {
            lastFx = this.effects[this.effects.length - 1];
        }
        lastFx.connect(this.output);
        if (this.outputBus === "master") {
            this.output.connect(DMAF.context.destination);
        } else {
            this.output.connect(DMAF.AudioBusManager.getActiveInstance(this.outputBus).input);
        }
    };
    DMAF.Sound.AudioBus.prototype = Object.create(null, {
        gain: {
            get: function () {
                return this.output.gain;
            },
            set: function (value) {
                this.ouput.gain.value = value;
            }
        },
        getAutomatableProperties: {
            value: function (property) {
                if (property.substring(0, 2) == "fx") {
                    return this.effects[parseInt(property.substring(2), 10)].effectNode;
                }
            }
        },
        setAutomatableProperty: {
            value: function (property, value, duration, actionTime) {
                var method = duration > 0 ? "linearRampToValueAtTime" : "setValueAtAtTime";
                switch (property) {
                case "volume":
                    value = parseFloat(value);
                    property = "gain";
                    break;
                case "pan":
                    break;
                default:
                    return; //Needs value/property checks if more properties are to be added.
                }
                this.output[property].cancelScheduledValues(DMAF.context.currentTime);
                this.output[property].setValueAtTime(this.output[property].value, DMAF.context.currentTime);
                this.output[property][method](value, (actionTime + duration) / 1000);
            }
        },
        onAction: {
            value: function () {}
        }
    });
    //------------------------------------SoundStop------------------------------------//
    /*
    DMAF.Actions.SoundStop = function (actionProperties) {
        this.targets = actionProperties.targets;
        this.actionProperties = actionProperties;
    };
    DMAF.Actions.SoundStop.prototype = Object.create({}, {
        type: {value: "SOUND_STOP"},
        execute: {
            value: function (eventProperties, trigger, actionTime) {
                var target;
                for (var i = 0, ii = this.targets.length; i < ii; i++) {
                    target = DMAF.Managers.getSoundManager().getSoundInstance(this.targets[i]);
                    target.stop(actionTime);
                }
            }
        }
    });
    */
});


///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
// beginplink


(function () {
    var myId, userIndex, userName, connection;

    function broadcast(data) {
        connection.emit("broadcast", data);
    }
    function emit(data) {
        connection.emit("emit", data);
    }
    function tellServer(data) {
        connection.emit("server", data);
    }
    function local(data) {
        dmaf.tell(data.type, data);
        emit(data);
    }
    function setup() {
        var ip = "http://95.85.37.129:4444"; // currently used by plink.dinahmoe.com
        //var ip = "http://95.85.22.21:4444/"; //digitalocean
        //var ip = "http://164.177.150.205:4444/"; // rackspace
        //var ip = "http://127.0.0.1:4444/";
        if(connection){
            connection.socket.connect();
        } else {
            connection = io.connect(ip, {
                "reconnect": false,
                "sync disconnect on unload": true
            });
        }
        myId = null;
        userIndex = plink.userIndex;
        setupListeners(connection);
        dmaf.registerEmitter(emit);
        dmaf.registerServerEmitter(tellServer);
        dmaf.registerBroadcaster(broadcast);
    }
    function setupListeners(connection) {
        connection.on("event", onEvent);

        connection.on("connect", onConnect);

        connection.on("disconnect", onDisconnect);

        connection.on("connect_failed", onConnectFailed);
    }
    function destroyListeners(connection){
        connection.removeListener("event", onEvent);

        connection.removeListener("connect", onConnect);

        connection.removeListener("disconnect", onDisconnect);

        connection.removeListener("connect_failed", onConnectFailed);
    }
    function close() {
        if (connection) {
            connection.disconnect();
        }
    }

    window.broadcaster = {
        close: close,
        setup: setup,
        local: local
    };

    //listeners
    function onEvent(data) {
        var eventTime;
        switch (data.type) {
            //set myId
            case "0":
                if (data.id !== myId) {
                    myId = data.id;
                    plink.userId(myId);
                }
                plink.user[myId] = new plink.User(myId, plink.userName());
                return;
            //someone played a note
            case "1":
                if (data.id === myId) {
                    return;
                }
                plink.user[data.id].mouseIsDown = true;
                plink.user[data.id].hasNote = true;
                return;
            //someone moved their mouse
            case "2":
                if (data.id === myId) {
                    return;
                }
                if (!plink.user[data.id]) {
                    return;
                }
                plink.user[data.id].updateY(parseFloat(data.y) * plink.canvasHeight());
                plink.user[data.id].relativeY = parseFloat(data.y);
                return;
            //someone stopped playing a note
            case "3":
                if (data.id === myId) {
                    return;
                }
                plink.user[data.id].mouseIsDown = false;
                return;
             //someone joined the session
            case "4":
                if (data.id === myId) {
                    return;
                }
                plink.user[data.id] = new plink.User(data.id, data.name || "Sneaky Plinker", data.color);
                return;
            //someone left
            case "5":
                dmaf.tell("user_left", plink.user[data.id]);
                delete plink.user[data.id];
                userIndex.splice(userIndex.indexOf(data.id), 1);
                return;
            //someone changed instrument
            case "6":
                plink.user[data.id].selectedColor = parseInt(data.color, 10);
                return;
            //information about a plink.user currently in the session, when we join
            case "7":
                plink.user[data.id] = new plink.User(data.id, data.name, data.color);
                return;
            //someone changed name
            case "10":
                plink.user[data.id].name = data.name;
                return;
            //this clients inital color assigned by the server
            case "50":
                plink.user[myId].selectedColor = parseInt(data.color, 10);
                return;
            //server says we're good to go
            case "100":
                tellServer({
                    type: "getStartPosition",
                    bpm: 90
                });
                dmaf.dispatch("server_ready");
                return;
            //server wants to know about rooms and our name...
            case "500":
                console.log("telling server:", {
                    type: "room",
                    room: plink.roomName(),
                    name: plink.userName()
                });
                tellServer({
                    type: "room",
                    room: plink.roomName(),
                    name: plink.userName()
                });
                return;
            //room was full
            case "700":
                dmaf.once("server_ready", function () {
                    console.log("PLINK SAYS ROOM WAS FULL!");
                    plink.message("full", "The room you tried to enter has reached it's maximum number of users. You're being put in a public room instead.");
                    setTimeout(function () {
                        plink.message(false);
                    }, 2000);
                });
                return;
            //Server says we've been inactive for too long.
            case "900":
                if (data.id === myId) {
                    plink.isIdle = true;
                    connection.disconnect();
                }
                return;
            default:
                dmaf.tell(data.type, data, eventTime);
        }
    }
    function onConnect(data) {
        //console.log("connection created");
    }
    function onDisconnect() {
        dmaf.tell("keep_dead");
        destroyListeners(connection);
        dmaf.tell("stop_clock");
        dmaf.tell("destroySession");
        plink.destroySession();
        //console.log("Server closed connection. idle too long", plink.user);
        plink.message("disconnect");
    }
    function onConnectFailed() {
        dmaf.tell("stop_clock");
        plink.message("text", "Our server seems to be a little busy. Please try a reload.");
        //console.log("connection failed");
    }
})();/* Modernizr 2.6.2 (Custom Build) | MIT & BSD
 * Build: http://modernizr.com/download/#-canvas-audio-websockets-touch-cssclasses-prefixed-teststyles-testprop-testallprops-prefixes-domprefixes-audio_webaudio_api-requestanimationframe-load
 */
;window.Modernizr=function(a,b,c){function z(a){j.cssText=a}function A(a,b){return z(m.join(a+";")+(b||""))}function B(a,b){return typeof a===b}function C(a,b){return!!~(""+a).indexOf(b)}function D(a,b){for(var d in a){var e=a[d];if(!C(e,"-")&&j[e]!==c)return b=="pfx"?e:!0}return!1}function E(a,b,d){for(var e in a){var f=b[a[e]];if(f!==c)return d===!1?a[e]:B(f,"function")?f.bind(d||b):f}return!1}function F(a,b,c){var d=a.charAt(0).toUpperCase()+a.slice(1),e=(a+" "+o.join(d+" ")+d).split(" ");return B(b,"string")||B(b,"undefined")?D(e,b):(e=(a+" "+p.join(d+" ")+d).split(" "),E(e,b,c))}var d="2.6.2",e={},f=!0,g=b.documentElement,h="modernizr",i=b.createElement(h),j=i.style,k,l={}.toString,m=" -webkit- -moz- -o- -ms- ".split(" "),n="Webkit Moz O ms",o=n.split(" "),p=n.toLowerCase().split(" "),q={},r={},s={},t=[],u=t.slice,v,w=function(a,c,d,e){var f,i,j,k,l=b.createElement("div"),m=b.body,n=m||b.createElement("body");if(parseInt(d,10))while(d--)j=b.createElement("div"),j.id=e?e[d]:h+(d+1),l.appendChild(j);return f=["&#173;",'<style id="s',h,'">',a,"</style>"].join(""),l.id=h,(m?l:n).innerHTML+=f,n.appendChild(l),m||(n.style.background="",n.style.overflow="hidden",k=g.style.overflow,g.style.overflow="hidden",g.appendChild(n)),i=c(l,a),m?l.parentNode.removeChild(l):(n.parentNode.removeChild(n),g.style.overflow=k),!!i},x={}.hasOwnProperty,y;!B(x,"undefined")&&!B(x.call,"undefined")?y=function(a,b){return x.call(a,b)}:y=function(a,b){return b in a&&B(a.constructor.prototype[b],"undefined")},Function.prototype.bind||(Function.prototype.bind=function(b){var c=this;if(typeof c!="function")throw new TypeError;var d=u.call(arguments,1),e=function(){if(this instanceof e){var a=function(){};a.prototype=c.prototype;var f=new a,g=c.apply(f,d.concat(u.call(arguments)));return Object(g)===g?g:f}return c.apply(b,d.concat(u.call(arguments)))};return e}),q.canvas=function(){var a=b.createElement("canvas");return!!a.getContext&&!!a.getContext("2d")},q.touch=function(){var c;return"ontouchstart"in a||a.DocumentTouch&&b instanceof DocumentTouch?c=!0:w(["@media (",m.join("touch-enabled),("),h,")","{#modernizr{top:9px;position:absolute}}"].join(""),function(a){c=a.offsetTop===9}),c},q.websockets=function(){return"WebSocket"in a||"MozWebSocket"in a},q.audio=function(){var a=b.createElement("audio"),c=!1;try{if(c=!!a.canPlayType)c=new Boolean(c),c.ogg=a.canPlayType('audio/ogg; codecs="vorbis"').replace(/^no$/,""),c.mp3=a.canPlayType("audio/mpeg;").replace(/^no$/,""),c.wav=a.canPlayType('audio/wav; codecs="1"').replace(/^no$/,""),c.m4a=(a.canPlayType("audio/x-m4a;")||a.canPlayType("audio/aac;")).replace(/^no$/,"")}catch(d){}return c};for(var G in q)y(q,G)&&(v=G.toLowerCase(),e[v]=q[G](),t.push((e[v]?"":"no-")+v));return e.addTest=function(a,b){if(typeof a=="object")for(var d in a)y(a,d)&&e.addTest(d,a[d]);else{a=a.toLowerCase();if(e[a]!==c)return e;b=typeof b=="function"?b():b,typeof f!="undefined"&&f&&(g.className+=" "+(b?"":"no-")+a),e[a]=b}return e},z(""),i=k=null,e._version=d,e._prefixes=m,e._domPrefixes=p,e._cssomPrefixes=o,e.testProp=function(a){return D([a])},e.testAllProps=F,e.testStyles=w,e.prefixed=function(a,b,c){return b?F(a,b,c):F(a,"pfx")},g.className=g.className.replace(/(^|\s)no-js(\s|$)/,"$1$2")+(f?" js "+t.join(" "):""),e}(this,this.document),function(a,b,c){function d(a){return"[object Function]"==o.call(a)}function e(a){return"string"==typeof a}function f(){}function g(a){return!a||"loaded"==a||"complete"==a||"uninitialized"==a}function h(){var a=p.shift();q=1,a?a.t?m(function(){("c"==a.t?B.injectCss:B.injectJs)(a.s,0,a.a,a.x,a.e,1)},0):(a(),h()):q=0}function i(a,c,d,e,f,i,j){function k(b){if(!o&&g(l.readyState)&&(u.r=o=1,!q&&h(),l.onload=l.onreadystatechange=null,b)){"img"!=a&&m(function(){t.removeChild(l)},50);for(var d in y[c])y[c].hasOwnProperty(d)&&y[c][d].onload()}}var j=j||B.errorTimeout,l=b.createElement(a),o=0,r=0,u={t:d,s:c,e:f,a:i,x:j};1===y[c]&&(r=1,y[c]=[]),"object"==a?l.data=c:(l.src=c,l.type=a),l.width=l.height="0",l.onerror=l.onload=l.onreadystatechange=function(){k.call(this,r)},p.splice(e,0,u),"img"!=a&&(r||2===y[c]?(t.insertBefore(l,s?null:n),m(k,j)):y[c].push(l))}function j(a,b,c,d,f){return q=0,b=b||"j",e(a)?i("c"==b?v:u,a,b,this.i++,c,d,f):(p.splice(this.i++,0,a),1==p.length&&h()),this}function k(){var a=B;return a.loader={load:j,i:0},a}var l=b.documentElement,m=a.setTimeout,n=b.getElementsByTagName("script")[0],o={}.toString,p=[],q=0,r="MozAppearance"in l.style,s=r&&!!b.createRange().compareNode,t=s?l:n.parentNode,l=a.opera&&"[object Opera]"==o.call(a.opera),l=!!b.attachEvent&&!l,u=r?"object":l?"script":"img",v=l?"script":u,w=Array.isArray||function(a){return"[object Array]"==o.call(a)},x=[],y={},z={timeout:function(a,b){return b.length&&(a.timeout=b[0]),a}},A,B;B=function(a){function b(a){var a=a.split("!"),b=x.length,c=a.pop(),d=a.length,c={url:c,origUrl:c,prefixes:a},e,f,g;for(f=0;f<d;f++)g=a[f].split("="),(e=z[g.shift()])&&(c=e(c,g));for(f=0;f<b;f++)c=x[f](c);return c}function g(a,e,f,g,h){var i=b(a),j=i.autoCallback;i.url.split(".").pop().split("?").shift(),i.bypass||(e&&(e=d(e)?e:e[a]||e[g]||e[a.split("/").pop().split("?")[0]]),i.instead?i.instead(a,e,f,g,h):(y[i.url]?i.noexec=!0:y[i.url]=1,f.load(i.url,i.forceCSS||!i.forceJS&&"css"==i.url.split(".").pop().split("?").shift()?"c":c,i.noexec,i.attrs,i.timeout),(d(e)||d(j))&&f.load(function(){k(),e&&e(i.origUrl,h,g),j&&j(i.origUrl,h,g),y[i.url]=2})))}function h(a,b){function c(a,c){if(a){if(e(a))c||(j=function(){var a=[].slice.call(arguments);k.apply(this,a),l()}),g(a,j,b,0,h);else if(Object(a)===a)for(n in m=function(){var b=0,c;for(c in a)a.hasOwnProperty(c)&&b++;return b}(),a)a.hasOwnProperty(n)&&(!c&&!--m&&(d(j)?j=function(){var a=[].slice.call(arguments);k.apply(this,a),l()}:j[n]=function(a){return function(){var b=[].slice.call(arguments);a&&a.apply(this,b),l()}}(k[n])),g(a[n],j,b,n,h))}else!c&&l()}var h=!!a.test,i=a.load||a.both,j=a.callback||f,k=j,l=a.complete||f,m,n;c(h?a.yep:a.nope,!!i),i&&c(i)}var i,j,l=this.yepnope.loader;if(e(a))g(a,0,l,0);else if(w(a))for(i=0;i<a.length;i++)j=a[i],e(j)?g(j,0,l,0):w(j)?B(j):Object(j)===j&&h(j,l);else Object(a)===a&&h(a,l)},B.addPrefix=function(a,b){z[a]=b},B.addFilter=function(a){x.push(a)},B.errorTimeout=1e4,null==b.readyState&&b.addEventListener&&(b.readyState="loading",b.addEventListener("DOMContentLoaded",A=function(){b.removeEventListener("DOMContentLoaded",A,0),b.readyState="complete"},0)),a.yepnope=k(),a.yepnope.executeStack=h,a.yepnope.injectJs=function(a,c,d,e,i,j){var k=b.createElement("script"),l,o,e=e||B.errorTimeout;k.src=a;for(o in d)k.setAttribute(o,d[o]);c=j?h:c||f,k.onreadystatechange=k.onload=function(){!l&&g(k.readyState)&&(l=1,c(),k.onload=k.onreadystatechange=null)},m(function(){l||(l=1,c(1))},e),i?k.onload():n.parentNode.insertBefore(k,n)},a.yepnope.injectCss=function(a,c,d,e,g,i){var e=b.createElement("link"),j,c=i?h:c||f;e.href=a,e.rel="stylesheet",e.type="text/css";for(j in d)e.setAttribute(j,d[j]);g||(n.parentNode.insertBefore(e,n),m(c,0))}}(this,document),Modernizr.load=function(){yepnope.apply(window,[].slice.call(arguments,0))},Modernizr.addTest("webaudio",!!window.webkitAudioContext||!!window.AudioContext),Modernizr.addTest("raf",!!Modernizr.prefixed("requestAnimationFrame",window),Modernizr.addTest('_format', function(){Modernizr.format=Modernizr.audio.ogg==="probably"?'.ogg':Modernizr.audio.mp3==="probably"?'.mp3':Modernizr.audio.m4a==="probably"?'.aac':Modernizr.audio.ogg==="maybe"?'.ogg':Modernizr.audio.mp3==="maybe"?'.mp3':Modernizr.audio.m4a==="maybe"?'.aac':".mp3";return true;}));

(function (broadcaster) {
    var wHeight = window.innerHeight,
        wWidth = window.innerWidth;

    var lineHeight = (wHeight / 16) - (100 / 16),
        previousSentY = wHeight / 2,
        mouseY = wHeight / 2,
        heroX = wWidth / 2,
        lineWidth = 2,
        lines = [],
        TWOPI = Math.PI * 2;

    //fill lines
    for (i = 0; i < 17; i++) {
        lines.push(parseInt(lineHeight * i + 0.5, 10));
    }

    var fontString = "bold 12px sans-serif",
        pulseOnColor = 'rgba(40,40,40,0.3)',
        pulseOffColor = 'rgba(30,30,30,1)',
        lineColor = "#555",
        fontColor = "#FFF";

    var colors = [
        "rgba(250,250,50,1)",
        "rgba(23,87,100,1)",
        "rgba(250,0,0,1)",
        "rgba(250,175,89,1)",
        "rgba(15,150,250,1)",
        "rgba(140,140,140,1)",
        "rgba(250,102,250,1)",
        "rgba(0,192,0,1)"
    ];

    var touchMap = {
        down: Modernizr.touch ? "touchstart" : "mousedown",
        move: Modernizr.touch ? "touchmove" : "mousemove",
        up: Modernizr.touch ? "touchend" : "mouseup"
    };

    var raf = Modernizr.raf ? Modernizr.prefixed("requestAnimationFrame", window) : function (callback) {
        window.setTimeout(callback, Math.floor(1000 / 60));
    };

    var myId = "not set",
        userIndex = [],
        bubbles = [],
        user = {},
        pulseOn = false,
        domLoaded = false,
        dmafLoaded = false,
        audioLoaded = false,
        reconnect = false,
        state = "init";
    var colorRef = [

    ];
    var canvasHeight,
        userName,
        roomName,
        context,
        canvas,
        margin,
        middle,
        timer,
        myColor,
        device,
        isMobile;

    (function (agent) {
        var isChrome = /Chrome/.test(agent),
            isIphone = /iPhone/.test(agent),
            isWindows = /Windows/.test(agent),
            isIpad = /iPad/.test(agent);
        isMobile = /Mobile/.test(agent);
        if (isMobile) {
            if (isIphone) {
                device = "iPhone";
            } else if (isIpad) {
                device = "iPad";
            }
        }
    })(navigator.userAgent);


    function twitterEl () {
        //var deviceInfo = isMobile ? " on my " + device : "";
        //query = decodeURI(window.location.href).split('#');
        //roomName = query[query.length - 1];
        //if (!roomName.match("[A-Za-z0-9]") || roomName.match("http://labs.dinahmoe.com/plink")) {
        //    roomName = false;
        //}
        //if (roomName) {
        //    return "<a href=\"http://twitter.com/share?url=" + encodeURI(window.location.href) + "&via=DinahmoeSTHLM&text=I\'m%20playing%20#Plink" + deviceInfo + "%20-%20a%20multiplayer%20music%20experience%20by%20DinahMoe.%20Join%20my%20private%20jam%20at\" target=\"_blank\" class=\"twitter-share-button\">.</a>";
        //} else {
        //    return "<a href=\"http://twitter.com/share?url=" + encodeURI(window.location.href) + "&via=DinahmoeSTHLM&text=I\'m%20playing%20#Plink" + deviceInfo + "%20-%20a%20multiplayer%20music%20experience%20by%20DinahMoe.%20Try%20it%20yourself%20at\" target=\"_blank\" class=\"twitter-share-button\">.</a>";
        //}
    }

    function createElement (name, innerText, href, innerNodes) {
        var el,
            txt;
        switch (name) {
            case "share":
                var isIphone = /iPhone/.test(navigator.userAgent);
                el = document.createElement("div");
                el.id = "shareContainer";
                el.style["z-index"] = "1000";
                el.style["position"] = "relative";
                //if (!isIphone) {
                //    el.innerHTML = '<div id="shareMiddle" style="float:left">' +
                //    '<iframe src="//www.facebook.com/plugins/like.php?href=http%3A%2F%2Flabs.dinahmoe.com%2Fplink&amp;send=false&amp;layout=button_count&amp;width=450&amp;show_faces=false&amp;action=like&amp;colorscheme=light&amp;font&amp;height=21&amp;appId=291757404196301" scrolling="no" frameborder="0" style="border:none; overflow:hidden; width:90px; height:21px; float:left; clear:none" allowTransparency="true"></iframe>' +
                //    '<div class="g-plusone" data-size="medium" data-count="true"></div>' +
                //    twitterEl() +
                //    '</div>';
                //} else {
                //    el.innerHTML = '<div id="shareMiddle" style="float:left;width:180px;left:50%;margin-left:-70px;margin-top:10px">' +
                //    '<iframe src="//www.facebook.com/plugins/like.php?href=http%3A%2F%2Flabs.dinahmoe.com%2Fplink&amp;send=false&amp;layout=button_count&amp;width=450&amp;show_faces=false&amp;action=like&amp;colorscheme=light&amp;font&amp;height=21&amp;appId=291757404196301" scrolling="no" frameborder="0" style="border:none; overflow:hidden; width:90px; height:21px; float:left; clear:none" allowTransparency="true"></iframe>' +
                //    '<div class="g-plusone" data-size="medium" data-count="true"></div>' +
                //    twitterEl() +
                //    '</div>';
                //}
                //el.innerHTML = shareBtnHtml;

                makeSharingButtons(el);
                function makeSharingButtons (parent) {
                    var gplus = document.createElement("div"), 
                        gplusImg = document.createElement("img"),
                        twitter = document.createElement("div"),
                        twitterImg = document.createElement("img"),
                        face = document.createElement("div"),
                        faceImg = document.createElement("img"),
                        baseUrl = "http://dinahmoelabs.com/plink",
                        jamText = window.location.hash === "" ? "Try it here: " : "Join my private jam at: ",
                        shareText = "I'm playing #Plink - a multiplayer music experience by @DinahmoeSTHLM " + jamText,
                        shareContainer = document.createElement("div"),
                        //url = window.location.href.replace("?dismiss", ""),
                        url = "http://dinahmoelabs.com/plink",
                        isIphone = /iPhone/.test(navigator.userAgent);

                    twitter.className = "share-logo " + (isIphone ? "share-logo-mobile" : "");
                    twitterImg.src = "http://a6c2ddd44eeb424bbd81-387f99874fb8448921e210828b10137d.r13.cf5.rackcdn.com/img/Twitter_logo_blue.png";
                    twitterImg.className = "logo-img";
                    twitter.appendChild(twitterImg);
                    twitterImg.onclick = function () {
                        var href = "http://twitter.com/share?url=";
                        href += encodeURIComponent(url);
                        href += "&text=" + shareText.replace("#", "%23").replace("@", "%40");
                        //href += "&hashtags=Plink";
                        var popup = window.open(href, "share", "height=315, width=415");
                        if (window.focus) {
                            popup.focus();
                        }
                    };

                    face.className = "share-logo " + (isIphone ? "share-logo-mobile" : "");
                    faceImg.src = "http://a6c2ddd44eeb424bbd81-387f99874fb8448921e210828b10137d.r13.cf5.rackcdn.com/img/FB-f-Logo__blue_512.png";
                    faceImg.className = "logo-img";
                    face.appendChild(faceImg);
                    faceImg.onclick = function () {
                        var href = "https://www.facebook.com/sharer/sharer.php?u=" + url;
                        var popup = window.open(href, "share", "height=315, width=415");
                        if (window.focus) {
                            popup.focus();
                        }
                    };

                    // gplus has an initialization step below, but it needs to happen
                    // after the element has been attached to the document
                    gplus.className = "share-logo " + (isIphone ? "share-logo-mobile" : "");
                    gplusImg.src = "http://a6c2ddd44eeb424bbd81-387f99874fb8448921e210828b10137d.r13.cf5.rackcdn.com/img/g+icon_red.png";
                    gplusImg.className = "logo-img";
                    gplusImg.id = "gplus-img";
                    gplus.appendChild(gplusImg);

                    shareContainer.id = "dynamic-sharing-container";
                    shareContainer.appendChild(gplus);
                    shareContainer.appendChild(twitter);
                    shareContainer.appendChild(face);

                    parent.appendChild(shareContainer);

                    // init google share
                    gapi.interactivepost.render("gplus-img", {
                        contenturl: url,
                        clientid: "632065889396-9h3bn7ge9opghcu7uij6kr2a3ddko5vf.apps.googleusercontent.com",
                        prefilltext: shareText + url,
                        cookiepolicy: "single_host_origin",
                        calltoactionlabel: "CREATE",
                        calltoactionurl: url
                    });
                }
                return el;
            case "input":
                el = document.createElement("input");
                el.value = /Mobile/.test(navigator.userAgent) ? "Mobile Plinker" : "Sneaky Plinker";
                el.id = "nameInput";
                return el;
            case "br":
                el = document.createElement("br");
                return el;
            case "text":
                el = document.createTextNode(innerText);
                return el;
            case "ok":
                el = document.createElement("button");
                txt = document.createTextNode("Play");
                el.id = "ok";
                el.appendChild(txt);
                return el;
            case "loading":
                el = document.createElement("img");
                el.src = "img/loading.gif";
                el.alt = "loading...";
                return el;
            case "strong":
            case "p":
                el = document.createElement(name);
                if (innerText) {
                    txt = document.createTextNode(innerText);
                    el.appendChild(txt);
                }
                break;
            case "a":
                txt = document.createTextNode(innerText);
                el = document.createElement(name);
                el.href = href;
                el.appendChild(txt);
                return el;
        }
        if (innerNodes && innerNodes.length) {
            for (var i = 0, ii = innerNodes.length; i < ii; i++) {
                el.appendChild(innerNodes[i]);
            }
        }
        return el;
    }

    function message(name, argtext) {
        var textBox = document.getElementById("textBox");
        textBox.innerHTML = "";
        switch (name) {
            case "disconnect":
                if(reconnect && !plink.isIdle){
                    broadcaster.setup();
                    show("window");
                    message("loading");
                    dmaf.once("server_ready", function () {
                        message(false);
                    });
                    return;
                }
                var disc = createElement("p", "You've been idle for too long, or lost your connection! Press ok to reconnect.");
                var contin = createElement("ok");
                dmaf.tell("stop_clock");
                function docontinue() {
                    plink.isIdle = false;
                    broadcaster.setup();
                    message("loading");
                }
                contin.addEventListener("mousedown", docontinue);
                contin.addEventListener("touchstart", docontinue);
                dmaf.once("server_ready", function () {
                    message(false);
                });
                textBox.appendChild(disc);
                textBox.appendChild(contin);
                show("window");
                break;
            case "share":
                var p = createElement("p", "Invite your friends to a private jam!");
                var share = createElement("share");
                var cont = createElement("ok");
                share.style.position = "relative";
                textBox.appendChild(p);
                textBox.appendChild(share);
                //cont.style["margin-top"] = "70px";
                //cont.style["margin-left"] = "-100px";
                cont.innerText = "continue";
                textBox.appendChild(cont);
                function onContinue () {
                    cont.removeEventListener(touchMap.down, onContinue);
                    if (onokclick.state !== "complete") {
                        message("input");
                    } else {
                        message(false);
                        //document.location.reload();
                    }
                }
                cont.addEventListener("mousedown", onContinue);
                cont.addEventListener("touchstart", onContinue);
                if (onokclick.state !== "complete") {
                    onokclick.state = "input";
                }
                window.shares(document, 'script');

                break;
            case "text":
                var displayText = createElement("p", argtext);
                textBox.appendChild(displayText);
                break;
            case "full":
                show("window");
                var displayText = createElement("p", argtext);
                textBox.appendChild(displayText);
                break;
            case "init":
                var audioExperiment = createElement("p", undefined, undefined, [
                        createElement("strong", "Plink"),
                        createElement("text", " is a multiplayer music experience by "),
                        createElement("a", "Dinahmoe.", "http://www.dinahmoe.com/"),
                        createElement("br"),
                        createElement("text", "Click 'play' to get started!")
                    ]),
                    ok = createElement("ok"),
                    dontMiss = createElement("p", undefined, undefined, [
                        createElement("text", "Don't miss out on other audio goodies - check out "),
                        createElement("a", "dinahmoelabs.com", "http://dinahmoelabs.com"),
                        createElement("text", " and make sure you follow "),
                        createElement("a", "@DinahmoeSTHLM", "https://twitter.com/DinahmoeSTHLM")
                    ]);
                textBox.appendChild(audioExperiment);
                textBox.appendChild(ok);
                textBox.appendChild(dontMiss);

                // this is a hack to make the links open in a new tab
                var links = textBox.getElementsByTagName("a");
                for (var i = 0; i < links.length; i++) {
                    links[i].target = "_blank";
                }

                onokclick.state = name;
                document.getElementById("ok").addEventListener("mousedown", onokclick);
                document.getElementById("ok").addEventListener("touchstart", onokclick);

                if (/iPhone/.test(navigator.userAgent) && /iPad/.test(navigator.userAgent)) {
                    console.log("automatically starting");
                    onokclick();
                }
                break;
            case "compatibility":
                var err = createElement("p", "It looks like the browser you're using isn't compatible with Plink.", undefined, [
                        createElement("br"),
                        createElement("text", "Try downloading the latest version of "),
                        createElement("a", "Chome", "http://www.google.com/chrome"),
                        createElement("text", " then come back and try it out!")
                    ]);
                textBox.appendChild(err);
                break;
            case "serverError":
                break;
            case "input":
                var isIphone = /iPhone/.test(navigator.userAgent),
                    input = createElement("input"),
                    multiplayer,
                    enter,
                    shareIt;
                var p = createElement("p", "And why don't you give your friends a shout so they can join?");
                if (isIphone) {
                    enter = createElement("p", "Please enter a nickname to display to others.");
                    textBox.appendChild(enter);
                    textBox.appendChild(input);
                    textBox.appendChild(createElement("ok"));
                } else {
                    enter = createElement("p", "Please enter a nickname to display to others.");
                    //shareIt = createElement("share");
                    textBox.appendChild(enter);
                    textBox.appendChild(input);
                    textBox.appendChild(createElement("ok"));
                    textBox.appendChild(p);
                    //textBox.appendChild(shareIt);
                    //window.shares(document, 'script');
                }
                onokclick.state = name;
                document.getElementById("ok").addEventListener("mousedown", onokclick);
                document.getElementById("ok").addEventListener("touchstart", onokclick);
                
                // new sharing and direct link
                makeSharingButtons(textBox);
                function makeSharingButtons (parent) {
                    var gplus = document.createElement("div"), 
                        gplusImg = document.createElement("img"),
                        twitter = document.createElement("div"),
                        twitterImg = document.createElement("img"),
                        face = document.createElement("div"),
                        faceImg = document.createElement("img"),
                        baseUrl = "http://dinahmoelabs.com/plink",
                        jamText = window.location.hash === "" ? "Try it here: " : "Join my private jam at: ",
                        shareText = "I'm playing #Plink - a multiplayer music experience by @DinahmoeSTHLM " + jamText,
                        shareContainer = document.createElement("div"),
                        //url = window.location.href.replace("?dismiss", ""), // TODO what is the url
                        url = "http://dinahmoelabs.com/plink",
                        isIphone = /iPhone/.test(navigator.userAgent);

                    twitter.className = "share-logo " + (isIphone ? "share-logo-mobile" : "");
                    twitterImg.src = "http://a6c2ddd44eeb424bbd81-387f99874fb8448921e210828b10137d.r13.cf5.rackcdn.com/img/Twitter_logo_blue.png";
                    twitterImg.className = "logo-img";
                    twitter.appendChild(twitterImg);
                    twitterImg.onclick = function () {
                        var href = "http://twitter.com/share?url=";
                        href += encodeURIComponent(url);
                        href += "&text=" + shareText.replace("#", "%23").replace("@", "%40");
                        //href += "&hashtags=Plink";
                        var popup = window.open(href, "share", "height=315, width=415");
                        if (window.focus) {
                            popup.focus();
                        }
                    };

                    face.className = "share-logo " + (isIphone ? "share-logo-mobile" : "");
                    faceImg.src = "http://a6c2ddd44eeb424bbd81-387f99874fb8448921e210828b10137d.r13.cf5.rackcdn.com/img/FB-f-Logo__blue_512.png";
                    faceImg.className = "logo-img";
                    face.appendChild(faceImg);
                    faceImg.onclick = function () {
                        var href = "https://www.facebook.com/sharer/sharer.php?u=" + url;
                        var popup = window.open(href, "share", "height=315, width=415");
                        if (window.focus) {
                            popup.focus();
                        }
                    };

                    // gplus has an initialization step below, but it needs to happen
                    // after the element has been attached to the document
                    gplus.className = "share-logo " + (isIphone ? "share-logo-mobile" : "");
                    gplusImg.src = "http://a6c2ddd44eeb424bbd81-387f99874fb8448921e210828b10137d.r13.cf5.rackcdn.com/img/g+icon_red.png";
                    gplusImg.className = "logo-img";
                    gplusImg.id = "gplus-img";
                    gplus.appendChild(gplusImg);

                    shareContainer.id = "dynamic-sharing-container";
                    shareContainer.appendChild(gplus);
                    shareContainer.appendChild(twitter);
                    shareContainer.appendChild(face);

                    parent.appendChild(shareContainer);

                    // init google share
                    gapi.interactivepost.render("gplus-img", {
                        contenturl: url,
                        clientid: "632065889396-9h3bn7ge9opghcu7uij6kr2a3ddko5vf.apps.googleusercontent.com",
                        prefilltext: shareText + url,
                        cookiepolicy: "single_host_origin",
                        calltoactionlabel: "CREATE",
                        calltoactionurl: url
                    });
                }
                break;
            case "loading":
                if(reconnect){
                    resetSession();
                    reconnect = false;
                }
                var loadingText = createElement("p", "Plink is syncing you to our servers, hang tight!", undefined, [createElement("br")]),
                    load = createElement("loading");
                textBox.appendChild(loadingText);
                textBox.appendChild(load);
                break;
            case "audioLoading":
                var loadingText = createElement("p", "Plink is loading your sounds! Please be patient.", undefined, [createElement("br")]),
                    load = createElement("loading");
                textBox.appendChild(loadingText);
                textBox.appendChild(load);
                break;
            case false:
                hide("window");
                break;
            default:
                //console.log("Unrecognized message");
        }
    }

    function hide(el) {
        var target = document.getElementById(el);
        if (!target.classList.contains("hidden")) {
            target.classList.add("hidden");
        }
    }

    function show(el) {
        var target = document.getElementById(el);
        if (target.classList.contains("hidden")) {
            target.classList.remove("hidden");
        }
    }

    function reflow() {
        if (!canvas) {
            return;
        }

        wWidth = window.innerWidth;
        wHeight = window.innerHeight;
        margin = document.getElementById("header").clientHeight;
        middle = wHeight - margin * 2;
        canvas.width = wWidth;
        canvas.height = middle;
        canvasHeight = canvas.clientHeight;
        yLimit = canvas.clientTop + canvas.clientHeight;
        lineHeight = canvasHeight / 16;
        lines = [];
        //fill lines
        for (i = 0; i < 17; i++) {
            lines.push(parseInt(lineHeight * i + 0.5, 10));
        }
        heroX = parseInt(wWidth * 0.5, 10);
        previousSentY = mouseY = ~~ (wHeight * 0.5);
        if (userIndex.length < 2) {
            return;
        }
        var id;
        for (var i = 0, ii = userIndex.length; i < ii; i++) {
            id = userIndex[i];
            if (id !== myId) {
                user[id].mouseY = user[id].relativeY * canvasHeight;
            }
        }
    }

    function User(id, name, color) {
        this.id = id;
        this.selectedColor = parseInt(color, 10) === undefined ? 1 : parseInt(color, 10);
        this.mouseY = ~~ (wHeight / 2);
        this.mouseIsDown = false;
        this.previousNote = -1;
        this.currentNote = 8;
        this.previousY = 0;
        this.relativeY = 0.5;
        this.name = name;
        userIndex.push(this.id);
        dmaf.tell("user_joined", this);
    }
    User.prototype = {
        getNote: function () {
            this.currentNote = ~~ ((user[this.id].mouseY * -1) / lineHeight) + 15;
        },
        updateY: function (y) {
            this.mouseY = y;
        }
    };

    function onmove(event) {
        var yPos = event.pageY;

        if(event.targetTouches){
            yPos = event.targetTouches[0].pageY;
        }
        mouseY = yPos - margin;
        if (mouseY > yLimit) {
            mouseY = yLimit;
        }
        if (mouseY < 1) {
            mouseY = 1;
        }
        user[myId].mouseY = mouseY;
    }

    function ondown(event) {
        onmove(event);
        if (mouseY !== previousSentY) {
            broadcaster.local({
                type: "2",
                y: (mouseY / canvasHeight),
                id: myId
            });
            previousSentY = mouseY;
        }
        broadcaster.local({
            type: "1",
            id: myId
        });
        user[myId].mouseIsDown = true;
        user[myId].hasNote = true;
        event.preventDefault();
    }

    function onup(event) {
        broadcaster.local({
            type: "3",
            id: myId,
            note: user[myId].previousNote
        });
        user[myId].mouseIsDown = false;
        event.preventDefault();
    }

    function onswatchclick(event) {
        broadcaster.local({
            type: "6",
            color: parseInt(this.data, 10),
            id: myId
        });
        user[myId].selectedColor = parseInt(this.data, 10);
        event.preventDefault();
    }

    function onokclick(e) {
        switch (onokclick.state) {
            case "init":
                dmaf.once("loadComplete_plink", function () {
                    message("input");
                });
                dmaf.dispatch("kick_note");
                onokclick.state = "input";
                //console.log("dispatching: loading instruments");
                dmaf.tell("load_instruments");
                message("audioLoading");
                return;
            case "input":
                var nameInput = document.getElementById("nameInput");
                while (!nameInput.value.match(/^[a-zA-Z\s\d]+$/) || nameInput.value.length > 30) {
                    nameInput.value = prompt("Sorry, please use A-z and numbers only!", "Mr Plink");
                }
                userName = nameInput.value;
                //console.log("Adding server_ready listener.");
                dmaf.once("server_ready", function () {
                    canvas.addEventListener("mousedown", ondown, false);
                    canvas.addEventListener("mousemove", onmove, false);
                    window.addEventListener("mouseup", onup, false);
                    canvas.addEventListener("touchstart", ondown, false);
                    canvas.addEventListener("touchmove", onmove, false);
                    window.addEventListener("touchend", onup, false);
                    message(false);
                    show("pallete");
                    keepDrawing = true;
                    draw();
                });
                broadcaster.setup();
                onokclick.state = "complete";
                //console.log("Displaying loading message.");
                message("loading");
                return;
        }
    }

    function shareClick () {
        show("window");
        message("share");
    }

    function pulse () {
        pulseOn = true;
        setTimeout(dePulse, 116);
    }

    function dePulse () {
        pulseOn = false;
    }

    var i, currentUser, bubble;
    function draw() {
        if(!keepDrawing){
            //don't draw!
            return;
        }

        draw.thisFrame = dmaf.context.currentTime;
        draw.delta = (draw.thisFrame - draw.lastFrame) * 60;

        //Pulse Color
        context.lineWidth = 1;
        context.strokeStyle = lineColor;
        context.fillStyle = pulseOn ? pulseOnColor : pulseOffColor;
        context.fillRect(0, 0, wWidth, canvasHeight);

        //Draw reference lines
        context.beginPath();
        for (i = lines.length - 1; i >= 0; i--) {
            context.moveTo(0, lines[i]);
            context.lineTo(wWidth, lines[i]);
        }
        context.stroke();
        context.closePath();

        //Add new bubbles for all users and print names
        context.fillStyle = fontColor;
        context.font = fontString;
        for (i = userIndex.length - 1; i >= 0; i--) {
            currentUser = user[userIndex[i]];
            bubbles.unshift({
                xPos: heroX,
                yPos: ~~currentUser.mouseY,
                xSpeed: 12,
                width: parseInt(lineWidth * (Math.random() * 5) + 2, 10),
                color: colors[currentUser.selectedColor],
                filled: currentUser.mouseIsDown
            });
            context.fillText(currentUser.name, heroX + 25, currentUser.mouseY + 5);
        }

        //update bubbles
        for(i = bubbles.length - 1; i >= 0; i--){
            bubble = bubbles[i];
            //remove bubble if it's off screen
            if (bubble.xPos < 0) {
                bubbles.splice(i, 1);
                continue;
            }
            //Push bubble-x-positions to the left
            bubble.xPos -= parseInt(bubble.xSpeed * draw.delta, 10);
            //draw the bubbles
            context.beginPath();
            context.arc(bubble.xPos, bubble.yPos, bubble.width, 0, TWOPI, true);
            context.closePath();
            if (bubble.filled) {
                context.fillStyle = bubble.color;
                context.fill();
            } else {
                context.strokeStyle = bubble.color;
                context.stroke();
            }
        }

        //originCircle
        context.beginPath();
        context.arc(heroX, user[myId].mouseY, 20, 0, TWOPI, true);
        context.closePath();
        context.strokeStyle = colors[user[myId].selectedColor];
        context.stroke();

        if (mouseY !== previousSentY) {
            broadcaster.local({
                type: "2",
                y: mouseY / canvasHeight,
                id: myId
            });
            previousSentY = mouseY;
        }
        draw.lastFrame = draw.thisFrame;
        raf(draw);
    }
    draw.lastFrame = 0;

    function init() {
        var swatches, share, action, query;
        if (!dmafLoaded || !domLoaded) {
            return;
        }
        if (!Modernizr.websockets) {
            message("compatibility");
            return;
        }
        if (/iPhone/.test(navigator.userAgent) || /Android/.test(navigator.userAgent)) {
            share = document.getElementById("share");
            share.parentElement.removeChild(share);
            share = document.createElement("div");
            share.id = "mobileShare";
            share.innerText = "share";
            share.addEventListener("mousedown", shareClick);
            share.addEventListener("touchstart", shareClick);
            document.querySelector("header").appendChild(share);
        }

        //check if the iPhone 5 detector div has a width of 1px, if so we're on an iPhone 5
        var iphoneDetector = document.getElementById("iphoneDetector");
        if(getComputedStyle(iphoneDetector).getPropertyValue("width") === "1px"){
            dmaf.tell("is_iPhone5");
        }

        swatches = document.getElementsByClassName("swatch");
        action = document.getElementById("action");
        canvas = document.getElementById("music");
        context = canvas.getContext("2d");
        context.font = fontString;
        action.innerText = Modernizr.touch ? "touch" : "mouse down";
        reflow();
        for (var i = 0, ii = swatches.length; i < ii; i++) {
            swatches[i].addEventListener("mousedown", onswatchclick);
            swatches[i].addEventListener("touchstart", onswatchclick);
            swatches[i].data = i;
        }
        //console.log("room name is", roomName);
        hide("loading");
        message("init");
    }
    function resetColor () {
        var swatches = document.getElementsByClassName("swatch"),
            dummyEvent = {preventDefault: function (){}};
        onswatchclick.call(swatches[myColor], dummyEvent);
    }
    function resetSession(){
        //console.log("Adding server_ready listener.");
        dmaf.once("server_ready", function () {
            //console.log("server_ready handler has run!");
            canvas.addEventListener("mousedown", ondown, false);
            canvas.addEventListener("mousemove", onmove, false);
            window.addEventListener("mouseup", onup, false);
            canvas.addEventListener("touchstart", ondown, false);
            canvas.addEventListener("touchmove", onmove, false);
            window.addEventListener("touchend", onup, false);
            //console.log("Adding user event handlers");
            message(false);
            show("pallete");
            keepDrawing = true;
            draw();
            resetColor();
            console.log("My Color on reconnect " +  myColor);
        });
        onokclick.state = "complete";
    }
    function destroySession(isIdle){
        myColor = user[myId].selectedColor;
        console.log("My Color on disconnect " + myColor);
        userIndex = [];
        bubbles = [];
        user = {};
        plink.user = user;
        plink.userIndex = userIndex;
        myId = null;
        keepDrawing = false;
        canvas.removeEventListener("mousedown", ondown, false);
        canvas.removeEventListener("mousemove", onmove, false);
        window.removeEventListener("mouseup", onup, false);
        canvas.removeEventListener("touchstart", ondown, false);
        canvas.removeEventListener("touchmove", onmove, false);
        window.removeEventListener("touchend", onup, false);
        reconnect = true;
    }
    function onDMAFFail () {
        message("compatibility");
    }
    function onload () {
        // this added a twitter sharing button
        // now just part of index.html
        //var twi = document.createElement("div");
        //twi.style.display = "inline";
        //twi.innerHTML = twitterEl();
        //document.getElementById("share").appendChild(twi);
        shares(document, 'script');
        domLoaded = true;
        init();
    }
    function onDMAFLoad () {
        dmafLoaded = true;
        init();
    }
    window.plink = {
        user: user,
        User: User,
        destroySession: destroySession,
        message: message,
        userIndex: userIndex,
        userId: function (id) {
            if (id) {
                myId = id;
            } else {
                return myId;
            }
        },
        userName: function (name) {
            if (name) {
                userName = name;
            } else {
                return userName;
            }
        },
        roomName: function (room) {
            if (room) {
                roomName = room;
            } else {
                console.log("roomName is:", roomName);
                if (roomName === undefined) {
                    roomName = false;
                }
                return roomName;
            }
        },
        canvasHeight: function () {
            return canvasHeight;
        }
    };
    window.___gcfg = {
        lang: 'en-US',
        parsetags: 'onload'
    };

    dmaf.addEventListener("beat", pulse);
    dmaf.once("dmaf_init", onDMAFLoad);
    dmaf.once("dmaf_fail", onDMAFFail);
    dmaf.once("loadComplete_plink", function () {
        //console.log("instruments finished loading setting audioLoaded to true.");
        audioLoaded = true;
    });
    window.addEventListener("load", onload);
    window.addEventListener("resize", reflow);
    window.addEventListener("orientationchange", reflow);
})(this.broadcaster);


///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////


/*! Socket.IO.js build:0.9.11, development. Copyright(c) 2011 LearnBoost <dev@learnboost.com> MIT Licensed */

var io = ('undefined' === typeof module ? {} : module.exports);
(function() {

/**
 * socket.io
 * Copyright(c) 2011 LearnBoost <dev@learnboost.com>
 * MIT Licensed
 */

(function (exports, global) {

  /**
   * IO namespace.
   *
   * @namespace
   */

  var io = exports;

  /**
   * Socket.IO version
   *
   * @api public
   */

  io.version = '0.9.11';

  /**
   * Protocol implemented.
   *
   * @api public
   */

  io.protocol = 1;

  /**
   * Available transports, these will be populated with the available transports
   *
   * @api public
   */

  io.transports = [];

  /**
   * Keep track of jsonp callbacks.
   *
   * @api private
   */

  io.j = [];

  /**
   * Keep track of our io.Sockets
   *
   * @api private
   */
  io.sockets = {};


  /**
   * Manages connections to hosts.
   *
   * @param {String} uri
   * @Param {Boolean} force creation of new socket (defaults to false)
   * @api public
   */

  io.connect = function (host, details) {
    var uri = io.util.parseUri(host)
      , uuri
      , socket;

    if (global && global.location) {
      uri.protocol = uri.protocol || global.location.protocol.slice(0, -1);
      uri.host = uri.host || (global.document
        ? global.document.domain : global.location.hostname);
      uri.port = uri.port || global.location.port;
    }

    uuri = io.util.uniqueUri(uri);

    var options = {
        host: uri.host
      , secure: 'https' == uri.protocol
      , port: uri.port || ('https' == uri.protocol ? 443 : 80)
      , query: uri.query || ''
    };

    io.util.merge(options, details);

    if (options['force new connection'] || !io.sockets[uuri]) {
      socket = new io.Socket(options);
    }

    if (!options['force new connection'] && socket) {
      io.sockets[uuri] = socket;
    }

    socket = socket || io.sockets[uuri];

    // if path is different from '' or /
    return socket.of(uri.path.length > 1 ? uri.path : '');
  };

})('object' === typeof module ? module.exports : (this.io = {}), this);
/**
 * socket.io
 * Copyright(c) 2011 LearnBoost <dev@learnboost.com>
 * MIT Licensed
 */

(function (exports, global) {

  /**
   * Utilities namespace.
   *
   * @namespace
   */

  var util = exports.util = {};

  /**
   * Parses an URI
   *
   * @author Steven Levithan <stevenlevithan.com> (MIT license)
   * @api public
   */

  var re = /^(?:(?![^:@]+:[^:@\/]*@)([^:\/?#.]+):)?(?:\/\/)?((?:(([^:@]*)(?::([^:@]*))?)?@)?([^:\/?#]*)(?::(\d*))?)(((\/(?:[^?#](?![^?#\/]*\.[^?#\/.]+(?:[?#]|$)))*\/?)?([^?#\/]*))(?:\?([^#]*))?(?:#(.*))?)/;

  var parts = ['source', 'protocol', 'authority', 'userInfo', 'user', 'password',
               'host', 'port', 'relative', 'path', 'directory', 'file', 'query',
               'anchor'];

  util.parseUri = function (str) {
    var m = re.exec(str || '')
      , uri = {}
      , i = 14;

    while (i--) {
      uri[parts[i]] = m[i] || '';
    }

    return uri;
  };

  /**
   * Produces a unique url that identifies a Socket.IO connection.
   *
   * @param {Object} uri
   * @api public
   */

  util.uniqueUri = function (uri) {
    var protocol = uri.protocol
      , host = uri.host
      , port = uri.port;

    if ('document' in global) {
      host = host || document.domain;
      port = port || (protocol == 'https'
        && document.location.protocol !== 'https:' ? 443 : document.location.port);
    } else {
      host = host || 'localhost';

      if (!port && protocol == 'https') {
        port = 443;
      }
    }

    return (protocol || 'http') + '://' + host + ':' + (port || 80);
  };

  /**
   * Mergest 2 query strings in to once unique query string
   *
   * @param {String} base
   * @param {String} addition
   * @api public
   */

  util.query = function (base, addition) {
    var query = util.chunkQuery(base || '')
      , components = [];

    util.merge(query, util.chunkQuery(addition || ''));
    for (var part in query) {
      if (query.hasOwnProperty(part)) {
        components.push(part + '=' + query[part]);
      }
    }

    return components.length ? '?' + components.join('&') : '';
  };

  /**
   * Transforms a querystring in to an object
   *
   * @param {String} qs
   * @api public
   */

  util.chunkQuery = function (qs) {
    var query = {}
      , params = qs.split('&')
      , i = 0
      , l = params.length
      , kv;

    for (; i < l; ++i) {
      kv = params[i].split('=');
      if (kv[0]) {
        query[kv[0]] = kv[1];
      }
    }

    return query;
  };

  /**
   * Executes the given function when the page is loaded.
   *
   *     io.util.load(function () { console.log('page loaded'); });
   *
   * @param {Function} fn
   * @api public
   */

  var pageLoaded = false;

  util.load = function (fn) {
    if ('document' in global && document.readyState === 'complete' || pageLoaded) {
      return fn();
    }

    util.on(global, 'load', fn, false);
  };

  /**
   * Adds an event.
   *
   * @api private
   */

  util.on = function (element, event, fn, capture) {
    if (element.attachEvent) {
      element.attachEvent('on' + event, fn);
    } else if (element.addEventListener) {
      element.addEventListener(event, fn, capture);
    }
  };

  /**
   * Generates the correct `XMLHttpRequest` for regular and cross domain requests.
   *
   * @param {Boolean} [xdomain] Create a request that can be used cross domain.
   * @returns {XMLHttpRequest|false} If we can create a XMLHttpRequest.
   * @api private
   */

  util.request = function (xdomain) {

    if (xdomain && 'undefined' != typeof XDomainRequest && !util.ua.hasCORS) {
      return new XDomainRequest();
    }

    if ('undefined' != typeof XMLHttpRequest && (!xdomain || util.ua.hasCORS)) {
      return new XMLHttpRequest();
    }

    if (!xdomain) {
      try {
        return new window[(['Active'].concat('Object').join('X'))]('Microsoft.XMLHTTP');
      } catch(e) { }
    }

    return null;
  };

  /**
   * XHR based transport constructor.
   *
   * @constructor
   * @api public
   */

  /**
   * Change the internal pageLoaded value.
   */

  if ('undefined' != typeof window) {
    util.load(function () {
      pageLoaded = true;
    });
  }

  /**
   * Defers a function to ensure a spinner is not displayed by the browser
   *
   * @param {Function} fn
   * @api public
   */

  util.defer = function (fn) {
    if (!util.ua.webkit || 'undefined' != typeof importScripts) {
      return fn();
    }

    util.load(function () {
      setTimeout(fn, 100);
    });
  };

  /**
   * Merges two objects.
   *
   * @api public
   */

  util.merge = function merge (target, additional, deep, lastseen) {
    var seen = lastseen || []
      , depth = typeof deep == 'undefined' ? 2 : deep
      , prop;

    for (prop in additional) {
      if (additional.hasOwnProperty(prop) && util.indexOf(seen, prop) < 0) {
        if (typeof target[prop] !== 'object' || !depth) {
          target[prop] = additional[prop];
          seen.push(additional[prop]);
        } else {
          util.merge(target[prop], additional[prop], depth - 1, seen);
        }
      }
    }

    return target;
  };

  /**
   * Merges prototypes from objects
   *
   * @api public
   */

  util.mixin = function (ctor, ctor2) {
    util.merge(ctor.prototype, ctor2.prototype);
  };

  /**
   * Shortcut for prototypical and static inheritance.
   *
   * @api private
   */

  util.inherit = function (ctor, ctor2) {
    function f() {};
    f.prototype = ctor2.prototype;
    ctor.prototype = new f;
  };

  /**
   * Checks if the given object is an Array.
   *
   *     io.util.isArray([]); // true
   *     io.util.isArray({}); // false
   *
   * @param Object obj
   * @api public
   */

  util.isArray = Array.isArray || function (obj) {
    return Object.prototype.toString.call(obj) === '[object Array]';
  };

  /**
   * Intersects values of two arrays into a third
   *
   * @api public
   */

  util.intersect = function (arr, arr2) {
    var ret = []
      , longest = arr.length > arr2.length ? arr : arr2
      , shortest = arr.length > arr2.length ? arr2 : arr;

    for (var i = 0, l = shortest.length; i < l; i++) {
      if (~util.indexOf(longest, shortest[i]))
        ret.push(shortest[i]);
    }

    return ret;
  };

  /**
   * Array indexOf compatibility.
   *
   * @see bit.ly/a5Dxa2
   * @api public
   */

  util.indexOf = function (arr, o, i) {

    for (var j = arr.length, i = i < 0 ? i + j < 0 ? 0 : i + j : i || 0;
         i < j && arr[i] !== o; i++) {}

    return j <= i ? -1 : i;
  };

  /**
   * Converts enumerables to array.
   *
   * @api public
   */

  util.toArray = function (enu) {
    var arr = [];

    for (var i = 0, l = enu.length; i < l; i++)
      arr.push(enu[i]);

    return arr;
  };

  /**
   * UA / engines detection namespace.
   *
   * @namespace
   */

  util.ua = {};

  /**
   * Whether the UA supports CORS for XHR.
   *
   * @api public
   */

  util.ua.hasCORS = 'undefined' != typeof XMLHttpRequest && (function () {
    try {
      var a = new XMLHttpRequest();
    } catch (e) {
      return false;
    }

    return a.withCredentials != undefined;
  })();

  /**
   * Detect webkit.
   *
   * @api public
   */

  util.ua.webkit = 'undefined' != typeof navigator
    && /webkit/i.test(navigator.userAgent);

   /**
   * Detect iPad/iPhone/iPod.
   *
   * @api public
   */

  util.ua.iDevice = 'undefined' != typeof navigator
      && /iPad|iPhone|iPod/i.test(navigator.userAgent);

})('undefined' != typeof io ? io : module.exports, this);
/**
 * socket.io
 * Copyright(c) 2011 LearnBoost <dev@learnboost.com>
 * MIT Licensed
 */

(function (exports, io) {

  /**
   * Expose constructor.
   */

  exports.EventEmitter = EventEmitter;

  /**
   * Event emitter constructor.
   *
   * @api public.
   */

  function EventEmitter () {};

  /**
   * Adds a listener
   *
   * @api public
   */

  EventEmitter.prototype.on = function (name, fn) {
    if (!this.$events) {
      this.$events = {};
    }

    if (!this.$events[name]) {
      this.$events[name] = fn;
    } else if (io.util.isArray(this.$events[name])) {
      this.$events[name].push(fn);
    } else {
      this.$events[name] = [this.$events[name], fn];
    }

    return this;
  };

  EventEmitter.prototype.addListener = EventEmitter.prototype.on;

  /**
   * Adds a volatile listener.
   *
   * @api public
   */

  EventEmitter.prototype.once = function (name, fn) {
    var self = this;

    function on () {
      self.removeListener(name, on);
      fn.apply(this, arguments);
    };

    on.listener = fn;
    this.on(name, on);

    return this;
  };

  /**
   * Removes a listener.
   *
   * @api public
   */

  EventEmitter.prototype.removeListener = function (name, fn) {
    if (this.$events && this.$events[name]) {
      var list = this.$events[name];

      if (io.util.isArray(list)) {
        var pos = -1;

        for (var i = 0, l = list.length; i < l; i++) {
          if (list[i] === fn || (list[i].listener && list[i].listener === fn)) {
            pos = i;
            break;
          }
        }

        if (pos < 0) {
          return this;
        }

        list.splice(pos, 1);

        if (!list.length) {
          delete this.$events[name];
        }
      } else if (list === fn || (list.listener && list.listener === fn)) {
        delete this.$events[name];
      }
    }

    return this;
  };

  /**
   * Removes all listeners for an event.
   *
   * @api public
   */

  EventEmitter.prototype.removeAllListeners = function (name) {
    if (name === undefined) {
      this.$events = {};
      return this;
    }

    if (this.$events && this.$events[name]) {
      this.$events[name] = null;
    }

    return this;
  };

  /**
   * Gets all listeners for a certain event.
   *
   * @api publci
   */

  EventEmitter.prototype.listeners = function (name) {
    if (!this.$events) {
      this.$events = {};
    }

    if (!this.$events[name]) {
      this.$events[name] = [];
    }

    if (!io.util.isArray(this.$events[name])) {
      this.$events[name] = [this.$events[name]];
    }

    return this.$events[name];
  };

  /**
   * Emits an event.
   *
   * @api public
   */

  EventEmitter.prototype.emit = function (name) {
    if (!this.$events) {
      return false;
    }

    var handler = this.$events[name];

    if (!handler) {
      return false;
    }

    var args = Array.prototype.slice.call(arguments, 1);

    if ('function' == typeof handler) {
      handler.apply(this, args);
    } else if (io.util.isArray(handler)) {
      var listeners = handler.slice();

      for (var i = 0, l = listeners.length; i < l; i++) {
        listeners[i].apply(this, args);
      }
    } else {
      return false;
    }

    return true;
  };

})(
    'undefined' != typeof io ? io : module.exports
  , 'undefined' != typeof io ? io : module.parent.exports
);

/**
 * socket.io
 * Copyright(c) 2011 LearnBoost <dev@learnboost.com>
 * MIT Licensed
 */

/**
 * Based on JSON2 (http://www.JSON.org/js.html).
 */

(function (exports, nativeJSON) {
  "use strict";

  // use native JSON if it's available
  if (nativeJSON && nativeJSON.parse){
    return exports.JSON = {
      parse: nativeJSON.parse
    , stringify: nativeJSON.stringify
    };
  }

  var JSON = exports.JSON = {};

  function f(n) {
      // Format integers to have at least two digits.
      return n < 10 ? '0' + n : n;
  }

  function date(d, key) {
    return isFinite(d.valueOf()) ?
        d.getUTCFullYear()     + '-' +
        f(d.getUTCMonth() + 1) + '-' +
        f(d.getUTCDate())      + 'T' +
        f(d.getUTCHours())     + ':' +
        f(d.getUTCMinutes())   + ':' +
        f(d.getUTCSeconds())   + 'Z' : null;
  };

  var cx = /[\u0000\u00ad\u0600-\u0604\u070f\u17b4\u17b5\u200c-\u200f\u2028-\u202f\u2060-\u206f\ufeff\ufff0-\uffff]/g,
      escapable = /[\\\"\x00-\x1f\x7f-\x9f\u00ad\u0600-\u0604\u070f\u17b4\u17b5\u200c-\u200f\u2028-\u202f\u2060-\u206f\ufeff\ufff0-\uffff]/g,
      gap,
      indent,
      meta = {    // table of character substitutions
          '\b': '\\b',
          '\t': '\\t',
          '\n': '\\n',
          '\f': '\\f',
          '\r': '\\r',
          '"' : '\\"',
          '\\': '\\\\'
      },
      rep;


  function quote(string) {

// If the string contains no control characters, no quote characters, and no
// backslash characters, then we can safely slap some quotes around it.
// Otherwise we must also replace the offending characters with safe escape
// sequences.

      escapable.lastIndex = 0;
      return escapable.test(string) ? '"' + string.replace(escapable, function (a) {
          var c = meta[a];
          return typeof c === 'string' ? c :
              '\\u' + ('0000' + a.charCodeAt(0).toString(16)).slice(-4);
      }) + '"' : '"' + string + '"';
  }


  function str(key, holder) {

// Produce a string from holder[key].

      var i,          // The loop counter.
          k,          // The member key.
          v,          // The member value.
          length,
          mind = gap,
          partial,
          value = holder[key];

// If the value has a toJSON method, call it to obtain a replacement value.

      if (value instanceof Date) {
          value = date(key);
      }

// If we were called with a replacer function, then call the replacer to
// obtain a replacement value.

      if (typeof rep === 'function') {
          value = rep.call(holder, key, value);
      }

// What happens next depends on the value's type.

      switch (typeof value) {
      case 'string':
          return quote(value);

      case 'number':

// JSON numbers must be finite. Encode non-finite numbers as null.

          return isFinite(value) ? String(value) : 'null';

      case 'boolean':
      case 'null':

// If the value is a boolean or null, convert it to a string. Note:
// typeof null does not produce 'null'. The case is included here in
// the remote chance that this gets fixed someday.

          return String(value);

// If the type is 'object', we might be dealing with an object or an array or
// null.

      case 'object':

// Due to a specification blunder in ECMAScript, typeof null is 'object',
// so watch out for that case.

          if (!value) {
              return 'null';
          }

// Make an array to hold the partial results of stringifying this object value.

          gap += indent;
          partial = [];

// Is the value an array?

          if (Object.prototype.toString.apply(value) === '[object Array]') {

// The value is an array. Stringify every element. Use null as a placeholder
// for non-JSON values.

              length = value.length;
              for (i = 0; i < length; i += 1) {
                  partial[i] = str(i, value) || 'null';
              }

// Join all of the elements together, separated with commas, and wrap them in
// brackets.

              v = partial.length === 0 ? '[]' : gap ?
                  '[\n' + gap + partial.join(',\n' + gap) + '\n' + mind + ']' :
                  '[' + partial.join(',') + ']';
              gap = mind;
              return v;
          }

// If the replacer is an array, use it to select the members to be stringified.

          if (rep && typeof rep === 'object') {
              length = rep.length;
              for (i = 0; i < length; i += 1) {
                  if (typeof rep[i] === 'string') {
                      k = rep[i];
                      v = str(k, value);
                      if (v) {
                          partial.push(quote(k) + (gap ? ': ' : ':') + v);
                      }
                  }
              }
          } else {

// Otherwise, iterate through all of the keys in the object.

              for (k in value) {
                  if (Object.prototype.hasOwnProperty.call(value, k)) {
                      v = str(k, value);
                      if (v) {
                          partial.push(quote(k) + (gap ? ': ' : ':') + v);
                      }
                  }
              }
          }

// Join all of the member texts together, separated with commas,
// and wrap them in braces.

          v = partial.length === 0 ? '{}' : gap ?
              '{\n' + gap + partial.join(',\n' + gap) + '\n' + mind + '}' :
              '{' + partial.join(',') + '}';
          gap = mind;
          return v;
      }
  }

// If the JSON object does not yet have a stringify method, give it one.

  JSON.stringify = function (value, replacer, space) {

// The stringify method takes a value and an optional replacer, and an optional
// space parameter, and returns a JSON text. The replacer can be a function
// that can replace values, or an array of strings that will select the keys.
// A default replacer method can be provided. Use of the space parameter can
// produce text that is more easily readable.

      var i;
      gap = '';
      indent = '';

// If the space parameter is a number, make an indent string containing that
// many spaces.

      if (typeof space === 'number') {
          for (i = 0; i < space; i += 1) {
              indent += ' ';
          }

// If the space parameter is a string, it will be used as the indent string.

      } else if (typeof space === 'string') {
          indent = space;
      }

// If there is a replacer, it must be a function or an array.
// Otherwise, throw an error.

      rep = replacer;
      if (replacer && typeof replacer !== 'function' &&
              (typeof replacer !== 'object' ||
              typeof replacer.length !== 'number')) {
          throw new Error('JSON.stringify');
      }

// Make a fake root object containing our value under the key of ''.
// Return the result of stringifying the value.

      return str('', {'': value});
  };

// If the JSON object does not yet have a parse method, give it one.

  JSON.parse = function (text, reviver) {
  // The parse method takes a text and an optional reviver function, and returns
  // a JavaScript value if the text is a valid JSON text.

      var j;

      function walk(holder, key) {

  // The walk method is used to recursively walk the resulting structure so
  // that modifications can be made.

          var k, v, value = holder[key];
          if (value && typeof value === 'object') {
              for (k in value) {
                  if (Object.prototype.hasOwnProperty.call(value, k)) {
                      v = walk(value, k);
                      if (v !== undefined) {
                          value[k] = v;
                      } else {
                          delete value[k];
                      }
                  }
              }
          }
          return reviver.call(holder, key, value);
      }


  // Parsing happens in four stages. In the first stage, we replace certain
  // Unicode characters with escape sequences. JavaScript handles many characters
  // incorrectly, either silently deleting them, or treating them as line endings.

      text = String(text);
      cx.lastIndex = 0;
      if (cx.test(text)) {
          text = text.replace(cx, function (a) {
              return '\\u' +
                  ('0000' + a.charCodeAt(0).toString(16)).slice(-4);
          });
      }

  // In the second stage, we run the text against regular expressions that look
  // for non-JSON patterns. We are especially concerned with '()' and 'new'
  // because they can cause invocation, and '=' because it can cause mutation.
  // But just to be safe, we want to reject all unexpected forms.

  // We split the second stage into 4 regexp operations in order to work around
  // crippling inefficiencies in IE's and Safari's regexp engines. First we
  // replace the JSON backslash pairs with '@' (a non-JSON character). Second, we
  // replace all simple value tokens with ']' characters. Third, we delete all
  // open brackets that follow a colon or comma or that begin the text. Finally,
  // we look to see that the remaining characters are only whitespace or ']' or
  // ',' or ':' or '{' or '}'. If that is so, then the text is safe for eval.

      if (/^[\],:{}\s]*$/
              .test(text.replace(/\\(?:["\\\/bfnrt]|u[0-9a-fA-F]{4})/g, '@')
                  .replace(/"[^"\\\n\r]*"|true|false|null|-?\d+(?:\.\d*)?(?:[eE][+\-]?\d+)?/g, ']')
                  .replace(/(?:^|:|,)(?:\s*\[)+/g, ''))) {

  // In the third stage we use the eval function to compile the text into a
  // JavaScript structure. The '{' operator is subject to a syntactic ambiguity
  // in JavaScript: it can begin a block or an object literal. We wrap the text
  // in parens to eliminate the ambiguity.

          j = eval('(' + text + ')');

  // In the optional fourth stage, we recursively walk the new structure, passing
  // each name/value pair to a reviver function for possible transformation.

          return typeof reviver === 'function' ?
              walk({'': j}, '') : j;
      }

  // If the text is not JSON parseable, then a SyntaxError is thrown.

      throw new SyntaxError('JSON.parse');
  };

})(
    'undefined' != typeof io ? io : module.exports
  , typeof JSON !== 'undefined' ? JSON : undefined
);

/**
 * socket.io
 * Copyright(c) 2011 LearnBoost <dev@learnboost.com>
 * MIT Licensed
 */

(function (exports, io) {

  /**
   * Parser namespace.
   *
   * @namespace
   */

  var parser = exports.parser = {};

  /**
   * Packet types.
   */

  var packets = parser.packets = [
      'disconnect'
    , 'connect'
    , 'heartbeat'
    , 'message'
    , 'json'
    , 'event'
    , 'ack'
    , 'error'
    , 'noop'
  ];

  /**
   * Errors reasons.
   */

  var reasons = parser.reasons = [
      'transport not supported'
    , 'client not handshaken'
    , 'unauthorized'
  ];

  /**
   * Errors advice.
   */

  var advice = parser.advice = [
      'reconnect'
  ];

  /**
   * Shortcuts.
   */

  var JSON = io.JSON
    , indexOf = io.util.indexOf;

  /**
   * Encodes a packet.
   *
   * @api private
   */

  parser.encodePacket = function (packet) {
    var type = indexOf(packets, packet.type)
      , id = packet.id || ''
      , endpoint = packet.endpoint || ''
      , ack = packet.ack
      , data = null;

    switch (packet.type) {
      case 'error':
        var reason = packet.reason ? indexOf(reasons, packet.reason) : ''
          , adv = packet.advice ? indexOf(advice, packet.advice) : '';

        if (reason !== '' || adv !== '')
          data = reason + (adv !== '' ? ('+' + adv) : '');

        break;

      case 'message':
        if (packet.data !== '')
          data = packet.data;
        break;

      case 'event':
        var ev = { name: packet.name };

        if (packet.args && packet.args.length) {
          ev.args = packet.args;
        }

        data = JSON.stringify(ev);
        break;

      case 'json':
        data = JSON.stringify(packet.data);
        break;

      case 'connect':
        if (packet.qs)
          data = packet.qs;
        break;

      case 'ack':
        data = packet.ackId
          + (packet.args && packet.args.length
              ? '+' + JSON.stringify(packet.args) : '');
        break;
    }

    // construct packet with required fragments
    var encoded = [
        type
      , id + (ack == 'data' ? '+' : '')
      , endpoint
    ];

    // data fragment is optional
    if (data !== null && data !== undefined)
      encoded.push(data);

    return encoded.join(':');
  };

  /**
   * Encodes multiple messages (payload).
   *
   * @param {Array} messages
   * @api private
   */

  parser.encodePayload = function (packets) {
    var decoded = '';

    if (packets.length == 1)
      return packets[0];

    for (var i = 0, l = packets.length; i < l; i++) {
      var packet = packets[i];
      decoded += '\ufffd' + packet.length + '\ufffd' + packets[i];
    }

    return decoded;
  };

  /**
   * Decodes a packet
   *
   * @api private
   */

  var regexp = /([^:]+):([0-9]+)?(\+)?:([^:]+)?:?([\s\S]*)?/;

  parser.decodePacket = function (data) {
    var pieces = data.match(regexp);

    if (!pieces) return {};

    var id = pieces[2] || ''
      , data = pieces[5] || ''
      , packet = {
            type: packets[pieces[1]]
          , endpoint: pieces[4] || ''
        };

    // whether we need to acknowledge the packet
    if (id) {
      packet.id = id;
      if (pieces[3])
        packet.ack = 'data';
      else
        packet.ack = true;
    }

    // handle different packet types
    switch (packet.type) {
      case 'error':
        var pieces = data.split('+');
        packet.reason = reasons[pieces[0]] || '';
        packet.advice = advice[pieces[1]] || '';
        break;

      case 'message':
        packet.data = data || '';
        break;

      case 'event':
        try {
          var opts = JSON.parse(data);
          packet.name = opts.name;
          packet.args = opts.args;
        } catch (e) { }

        packet.args = packet.args || [];
        break;

      case 'json':
        try {
          packet.data = JSON.parse(data);
        } catch (e) { }
        break;

      case 'connect':
        packet.qs = data || '';
        break;

      case 'ack':
        var pieces = data.match(/^([0-9]+)(\+)?(.*)/);
        if (pieces) {
          packet.ackId = pieces[1];
          packet.args = [];

          if (pieces[3]) {
            try {
              packet.args = pieces[3] ? JSON.parse(pieces[3]) : [];
            } catch (e) { }
          }
        }
        break;

      case 'disconnect':
      case 'heartbeat':
        break;
    };

    return packet;
  };

  /**
   * Decodes data payload. Detects multiple messages
   *
   * @return {Array} messages
   * @api public
   */

  parser.decodePayload = function (data) {
    // IE doesn't like data[i] for unicode chars, charAt works fine
    if (data.charAt(0) == '\ufffd') {
      var ret = [];

      for (var i = 1, length = ''; i < data.length; i++) {
        if (data.charAt(i) == '\ufffd') {
          ret.push(parser.decodePacket(data.substr(i + 1).substr(0, length)));
          i += Number(length) + 1;
          length = '';
        } else {
          length += data.charAt(i);
        }
      }

      return ret;
    } else {
      return [parser.decodePacket(data)];
    }
  };

})(
    'undefined' != typeof io ? io : module.exports
  , 'undefined' != typeof io ? io : module.parent.exports
);
/**
 * socket.io
 * Copyright(c) 2011 LearnBoost <dev@learnboost.com>
 * MIT Licensed
 */

(function (exports, io) {

  /**
   * Expose constructor.
   */

  exports.Transport = Transport;

  /**
   * This is the transport template for all supported transport methods.
   *
   * @constructor
   * @api public
   */

  function Transport (socket, sessid) {
    this.socket = socket;
    this.sessid = sessid;
  };

  /**
   * Apply EventEmitter mixin.
   */

  io.util.mixin(Transport, io.EventEmitter);


  /**
   * Indicates whether heartbeats is enabled for this transport
   *
   * @api private
   */

  Transport.prototype.heartbeats = function () {
    return true;
  };

  /**
   * Handles the response from the server. When a new response is received
   * it will automatically update the timeout, decode the message and
   * forwards the response to the onMessage function for further processing.
   *
   * @param {String} data Response from the server.
   * @api private
   */

  Transport.prototype.onData = function (data) {
    this.clearCloseTimeout();

    // If the connection in currently open (or in a reopening state) reset the close
    // timeout since we have just received data. This check is necessary so
    // that we don't reset the timeout on an explicitly disconnected connection.
    if (this.socket.connected || this.socket.connecting || this.socket.reconnecting) {
      this.setCloseTimeout();
    }

    if (data !== '') {
      // todo: we should only do decodePayload for xhr transports
      var msgs = io.parser.decodePayload(data);

      if (msgs && msgs.length) {
        for (var i = 0, l = msgs.length; i < l; i++) {
          this.onPacket(msgs[i]);
        }
      }
    }

    return this;
  };

  /**
   * Handles packets.
   *
   * @api private
   */

  Transport.prototype.onPacket = function (packet) {
    this.socket.setHeartbeatTimeout();

    if (packet.type == 'heartbeat') {
      return this.onHeartbeat();
    }

    if (packet.type == 'connect' && packet.endpoint == '') {
      this.onConnect();
    }

    if (packet.type == 'error' && packet.advice == 'reconnect') {
      this.isOpen = false;
    }

    this.socket.onPacket(packet);

    return this;
  };

  /**
   * Sets close timeout
   *
   * @api private
   */

  Transport.prototype.setCloseTimeout = function () {
    if (!this.closeTimeout) {
      var self = this;

      this.closeTimeout = setTimeout(function () {
        self.onDisconnect();
      }, this.socket.closeTimeout);
    }
  };

  /**
   * Called when transport disconnects.
   *
   * @api private
   */

  Transport.prototype.onDisconnect = function () {
    if (this.isOpen) this.close();
    this.clearTimeouts();
    this.socket.onDisconnect();
    return this;
  };

  /**
   * Called when transport connects
   *
   * @api private
   */

  Transport.prototype.onConnect = function () {
    this.socket.onConnect();
    return this;
  };

  /**
   * Clears close timeout
   *
   * @api private
   */

  Transport.prototype.clearCloseTimeout = function () {
    if (this.closeTimeout) {
      clearTimeout(this.closeTimeout);
      this.closeTimeout = null;
    }
  };

  /**
   * Clear timeouts
   *
   * @api private
   */

  Transport.prototype.clearTimeouts = function () {
    this.clearCloseTimeout();

    if (this.reopenTimeout) {
      clearTimeout(this.reopenTimeout);
    }
  };

  /**
   * Sends a packet
   *
   * @param {Object} packet object.
   * @api private
   */

  Transport.prototype.packet = function (packet) {
    this.send(io.parser.encodePacket(packet));
  };

  /**
   * Send the received heartbeat message back to server. So the server
   * knows we are still connected.
   *
   * @param {String} heartbeat Heartbeat response from the server.
   * @api private
   */

  Transport.prototype.onHeartbeat = function (heartbeat) {
    this.packet({ type: 'heartbeat' });
  };

  /**
   * Called when the transport opens.
   *
   * @api private
   */

  Transport.prototype.onOpen = function () {
    this.isOpen = true;
    this.clearCloseTimeout();
    this.socket.onOpen();
  };

  /**
   * Notifies the base when the connection with the Socket.IO server
   * has been disconnected.
   *
   * @api private
   */

  Transport.prototype.onClose = function () {
    var self = this;

    /* FIXME: reopen delay causing a infinit loop
    this.reopenTimeout = setTimeout(function () {
      self.open();
    }, this.socket.options['reopen delay']);*/

    this.isOpen = false;
    this.socket.onClose();
    this.onDisconnect();
  };

  /**
   * Generates a connection url based on the Socket.IO URL Protocol.
   * See <https://github.com/learnboost/socket.io-node/> for more details.
   *
   * @returns {String} Connection url
   * @api private
   */

  Transport.prototype.prepareUrl = function () {
    var options = this.socket.options;

    return this.scheme() + '://'
      + options.host + ':' + options.port + '/'
      + options.resource + '/' + io.protocol
      + '/' + this.name + '/' + this.sessid;
  };

  /**
   * Checks if the transport is ready to start a connection.
   *
   * @param {Socket} socket The socket instance that needs a transport
   * @param {Function} fn The callback
   * @api private
   */

  Transport.prototype.ready = function (socket, fn) {
    fn.call(this);
  };
})(
    'undefined' != typeof io ? io : module.exports
  , 'undefined' != typeof io ? io : module.parent.exports
);
/**
 * socket.io
 * Copyright(c) 2011 LearnBoost <dev@learnboost.com>
 * MIT Licensed
 */

(function (exports, io, global) {

  /**
   * Expose constructor.
   */

  exports.Socket = Socket;

  /**
   * Create a new `Socket.IO client` which can establish a persistent
   * connection with a Socket.IO enabled server.
   *
   * @api public
   */

  function Socket (options) {
    this.options = {
        port: 80
      , secure: false
      , document: 'document' in global ? document : false
      , resource: 'socket.io'
      , transports: io.transports
      , 'connect timeout': 10000
      , 'try multiple transports': true
      , 'reconnect': true
      , 'reconnection delay': 500
      , 'reconnection limit': Infinity
      , 'reopen delay': 3000
      , 'max reconnection attempts': 10
      , 'sync disconnect on unload': false
      , 'auto connect': true
      , 'flash policy port': 10843
      , 'manualFlush': false
    };

    io.util.merge(this.options, options);

    this.connected = false;
    this.open = false;
    this.connecting = false;
    this.reconnecting = false;
    this.namespaces = {};
    this.buffer = [];
    this.doBuffer = false;

    if (this.options['sync disconnect on unload'] &&
        (!this.isXDomain() || io.util.ua.hasCORS)) {
      var self = this;
      io.util.on(global, 'beforeunload', function () {
        self.disconnectSync();
      }, false);
    }

    if (this.options['auto connect']) {
      this.connect();
    }
};

  /**
   * Apply EventEmitter mixin.
   */

  io.util.mixin(Socket, io.EventEmitter);

  /**
   * Returns a namespace listener/emitter for this socket
   *
   * @api public
   */

  Socket.prototype.of = function (name) {
    if (!this.namespaces[name]) {
      this.namespaces[name] = new io.SocketNamespace(this, name);

      if (name !== '') {
        this.namespaces[name].packet({ type: 'connect' });
      }
    }

    return this.namespaces[name];
  };

  /**
   * Emits the given event to the Socket and all namespaces
   *
   * @api private
   */

  Socket.prototype.publish = function () {
    this.emit.apply(this, arguments);

    var nsp;

    for (var i in this.namespaces) {
      if (this.namespaces.hasOwnProperty(i)) {
        nsp = this.of(i);
        nsp.$emit.apply(nsp, arguments);
      }
    }
  };

  /**
   * Performs the handshake
   *
   * @api private
   */

  function empty () { };

  Socket.prototype.handshake = function (fn) {
    var self = this
      , options = this.options;

    function complete (data) {
      if (data instanceof Error) {
        self.connecting = false;
        self.onError(data.message);
      } else {
        fn.apply(null, data.split(':'));
      }
    };

    var url = [
          'http' + (options.secure ? 's' : '') + ':/'
        , options.host + ':' + options.port
        , options.resource
        , io.protocol
        , io.util.query(this.options.query, 't=' + +new Date)
      ].join('/');

    if (this.isXDomain() && !io.util.ua.hasCORS) {
      var insertAt = document.getElementsByTagName('script')[0]
        , script = document.createElement('script');

      script.src = url + '&jsonp=' + io.j.length;
      insertAt.parentNode.insertBefore(script, insertAt);

      io.j.push(function (data) {
        complete(data);
        script.parentNode.removeChild(script);
      });
    } else {
      var xhr = io.util.request();

      xhr.open('GET', url, true);
      if (this.isXDomain()) {
        xhr.withCredentials = true;
      }
      xhr.onreadystatechange = function () {
        if (xhr.readyState == 4) {
          xhr.onreadystatechange = empty;

          if (xhr.status == 200) {
            complete(xhr.responseText);
          } else if (xhr.status == 403) {
            self.onError(xhr.responseText);
          } else {
            self.connecting = false;            
            !self.reconnecting && self.onError(xhr.responseText);
          }
        }
      };
      xhr.send(null);
    }
  };

  /**
   * Find an available transport based on the options supplied in the constructor.
   *
   * @api private
   */

  Socket.prototype.getTransport = function (override) {
    var transports = override || this.transports, match;

    for (var i = 0, transport; transport = transports[i]; i++) {
      if (io.Transport[transport]
        && io.Transport[transport].check(this)
        && (!this.isXDomain() || io.Transport[transport].xdomainCheck(this))) {
        return new io.Transport[transport](this, this.sessionid);
      }
    }

    return null;
  };

  /**
   * Connects to the server.
   *
   * @param {Function} [fn] Callback.
   * @returns {io.Socket}
   * @api public
   */

  Socket.prototype.connect = function (fn) {
    if (this.connecting) {
      return this;
    }

    var self = this;
    self.connecting = true;
    
    this.handshake(function (sid, heartbeat, close, transports) {
      self.sessionid = sid;
      self.closeTimeout = close * 1000;
      self.heartbeatTimeout = heartbeat * 1000;
      if(!self.transports)
          self.transports = self.origTransports = (transports ? io.util.intersect(
              transports.split(',')
            , self.options.transports
          ) : self.options.transports);

      self.setHeartbeatTimeout();

      function connect (transports){
        if (self.transport) self.transport.clearTimeouts();

        self.transport = self.getTransport(transports);
        if (!self.transport) return self.publish('connect_failed');

        // once the transport is ready
        self.transport.ready(self, function () {
          self.connecting = true;
          self.publish('connecting', self.transport.name);
          self.transport.open();

          if (self.options['connect timeout']) {
            self.connectTimeoutTimer = setTimeout(function () {
              if (!self.connected) {
                self.connecting = false;

                if (self.options['try multiple transports']) {
                  var remaining = self.transports;

                  while (remaining.length > 0 && remaining.splice(0,1)[0] !=
                         self.transport.name) {}

                    if (remaining.length){
                      connect(remaining);
                    } else {
                      self.publish('connect_failed');
                    }
                }
              }
            }, self.options['connect timeout']);
          }
        });
      }

      connect(self.transports);

      self.once('connect', function (){
        clearTimeout(self.connectTimeoutTimer);

        fn && typeof fn == 'function' && fn();
      });
    });

    return this;
  };

  /**
   * Clears and sets a new heartbeat timeout using the value given by the
   * server during the handshake.
   *
   * @api private
   */

  Socket.prototype.setHeartbeatTimeout = function () {
    clearTimeout(this.heartbeatTimeoutTimer);
    if(this.transport && !this.transport.heartbeats()) return;

    var self = this;
    this.heartbeatTimeoutTimer = setTimeout(function () {
      self.transport.onClose();
    }, this.heartbeatTimeout);
  };

  /**
   * Sends a message.
   *
   * @param {Object} data packet.
   * @returns {io.Socket}
   * @api public
   */

  Socket.prototype.packet = function (data) {
    if (this.connected && !this.doBuffer) {
      this.transport.packet(data);
    } else {
      this.buffer.push(data);
    }

    return this;
  };

  /**
   * Sets buffer state
   *
   * @api private
   */

  Socket.prototype.setBuffer = function (v) {
    this.doBuffer = v;

    if (!v && this.connected && this.buffer.length) {
      if (!this.options['manualFlush']) {
        this.flushBuffer();
      }
    }
  };

  /**
   * Flushes the buffer data over the wire.
   * To be invoked manually when 'manualFlush' is set to true.
   *
   * @api public
   */

  Socket.prototype.flushBuffer = function() {
    this.transport.payload(this.buffer);
    this.buffer = [];
  };
  

  /**
   * Disconnect the established connect.
   *
   * @returns {io.Socket}
   * @api public
   */

  Socket.prototype.disconnect = function () {
    if (this.connected || this.connecting) {
      if (this.open) {
        this.of('').packet({ type: 'disconnect' });
      }

      // handle disconnection immediately
      this.onDisconnect('booted');
    }

    return this;
  };

  /**
   * Disconnects the socket with a sync XHR.
   *
   * @api private
   */

  Socket.prototype.disconnectSync = function () {
    // ensure disconnection
    var xhr = io.util.request();
    var uri = [
        'http' + (this.options.secure ? 's' : '') + ':/'
      , this.options.host + ':' + this.options.port
      , this.options.resource
      , io.protocol
      , ''
      , this.sessionid
    ].join('/') + '/?disconnect=1';

    xhr.open('GET', uri, false);
    xhr.send(null);

    // handle disconnection immediately
    this.onDisconnect('booted');
  };

  /**
   * Check if we need to use cross domain enabled transports. Cross domain would
   * be a different port or different domain name.
   *
   * @returns {Boolean}
   * @api private
   */

  Socket.prototype.isXDomain = function () {

    var port = global.location.port ||
      ('https:' == global.location.protocol ? 443 : 80);

    return this.options.host !== global.location.hostname 
      || this.options.port != port;
  };

  /**
   * Called upon handshake.
   *
   * @api private
   */

  Socket.prototype.onConnect = function () {
    if (!this.connected) {
      this.connected = true;
      this.connecting = false;
      if (!this.doBuffer) {
        // make sure to flush the buffer
        this.setBuffer(false);
      }
      this.emit('connect');
    }
  };

  /**
   * Called when the transport opens
   *
   * @api private
   */

  Socket.prototype.onOpen = function () {
    this.open = true;
  };

  /**
   * Called when the transport closes.
   *
   * @api private
   */

  Socket.prototype.onClose = function () {
    this.open = false;
    clearTimeout(this.heartbeatTimeoutTimer);
  };

  /**
   * Called when the transport first opens a connection
   *
   * @param text
   */

  Socket.prototype.onPacket = function (packet) {
    this.of(packet.endpoint).onPacket(packet);
  };

  /**
   * Handles an error.
   *
   * @api private
   */

  Socket.prototype.onError = function (err) {
    if (err && err.advice) {
      if (err.advice === 'reconnect' && (this.connected || this.connecting)) {
        this.disconnect();
        if (this.options.reconnect) {
          this.reconnect();
        }
      }
    }

    this.publish('error', err && err.reason ? err.reason : err);
  };

  /**
   * Called when the transport disconnects.
   *
   * @api private
   */

  Socket.prototype.onDisconnect = function (reason) {
    var wasConnected = this.connected
      , wasConnecting = this.connecting;

    this.connected = false;
    this.connecting = false;
    this.open = false;

    if (wasConnected || wasConnecting) {
      this.transport.close();
      this.transport.clearTimeouts();
      if (wasConnected) {
        this.publish('disconnect', reason);

        if ('booted' != reason && this.options.reconnect && !this.reconnecting) {
          this.reconnect();
        }
      }
    }
  };

  /**
   * Called upon reconnection.
   *
   * @api private
   */

  Socket.prototype.reconnect = function () {
    this.reconnecting = true;
    this.reconnectionAttempts = 0;
    this.reconnectionDelay = this.options['reconnection delay'];

    var self = this
      , maxAttempts = this.options['max reconnection attempts']
      , tryMultiple = this.options['try multiple transports']
      , limit = this.options['reconnection limit'];

    function reset () {
      if (self.connected) {
        for (var i in self.namespaces) {
          if (self.namespaces.hasOwnProperty(i) && '' !== i) {
              self.namespaces[i].packet({ type: 'connect' });
          }
        }
        self.publish('reconnect', self.transport.name, self.reconnectionAttempts);
      }

      clearTimeout(self.reconnectionTimer);

      self.removeListener('connect_failed', maybeReconnect);
      self.removeListener('connect', maybeReconnect);

      self.reconnecting = false;

      delete self.reconnectionAttempts;
      delete self.reconnectionDelay;
      delete self.reconnectionTimer;
      delete self.redoTransports;

      self.options['try multiple transports'] = tryMultiple;
    };

    function maybeReconnect () {
      if (!self.reconnecting) {
        return;
      }

      if (self.connected) {
        return reset();
      };

      if (self.connecting && self.reconnecting) {
        return self.reconnectionTimer = setTimeout(maybeReconnect, 1000);
      }

      if (self.reconnectionAttempts++ >= maxAttempts) {
        if (!self.redoTransports) {
          self.on('connect_failed', maybeReconnect);
          self.options['try multiple transports'] = true;
          self.transports = self.origTransports;
          self.transport = self.getTransport();
          self.redoTransports = true;
          self.connect();
        } else {
          self.publish('reconnect_failed');
          reset();
        }
      } else {
        if (self.reconnectionDelay < limit) {
          self.reconnectionDelay *= 2; // exponential back off
        }

        self.connect();
        self.publish('reconnecting', self.reconnectionDelay, self.reconnectionAttempts);
        self.reconnectionTimer = setTimeout(maybeReconnect, self.reconnectionDelay);
      }
    };

    this.options['try multiple transports'] = false;
    this.reconnectionTimer = setTimeout(maybeReconnect, this.reconnectionDelay);

    this.on('connect', maybeReconnect);
  };

})(
    'undefined' != typeof io ? io : module.exports
  , 'undefined' != typeof io ? io : module.parent.exports
  , this
);
/**
 * socket.io
 * Copyright(c) 2011 LearnBoost <dev@learnboost.com>
 * MIT Licensed
 */

(function (exports, io) {

  /**
   * Expose constructor.
   */

  exports.SocketNamespace = SocketNamespace;

  /**
   * Socket namespace constructor.
   *
   * @constructor
   * @api public
   */

  function SocketNamespace (socket, name) {
    this.socket = socket;
    this.name = name || '';
    this.flags = {};
    this.json = new Flag(this, 'json');
    this.ackPackets = 0;
    this.acks = {};
  };

  /**
   * Apply EventEmitter mixin.
   */

  io.util.mixin(SocketNamespace, io.EventEmitter);

  /**
   * Copies emit since we override it
   *
   * @api private
   */

  SocketNamespace.prototype.$emit = io.EventEmitter.prototype.emit;

  /**
   * Creates a new namespace, by proxying the request to the socket. This
   * allows us to use the synax as we do on the server.
   *
   * @api public
   */

  SocketNamespace.prototype.of = function () {
    return this.socket.of.apply(this.socket, arguments);
  };

  /**
   * Sends a packet.
   *
   * @api private
   */

  SocketNamespace.prototype.packet = function (packet) {
    packet.endpoint = this.name;
    this.socket.packet(packet);
    this.flags = {};
    return this;
  };

  /**
   * Sends a message
   *
   * @api public
   */

  SocketNamespace.prototype.send = function (data, fn) {
    var packet = {
        type: this.flags.json ? 'json' : 'message'
      , data: data
    };

    if ('function' == typeof fn) {
      packet.id = ++this.ackPackets;
      packet.ack = true;
      this.acks[packet.id] = fn;
    }

    return this.packet(packet);
  };

  /**
   * Emits an event
   *
   * @api public
   */
  
  SocketNamespace.prototype.emit = function (name) {
    var args = Array.prototype.slice.call(arguments, 1)
      , lastArg = args[args.length - 1]
      , packet = {
            type: 'event'
          , name: name
        };

    if ('function' == typeof lastArg) {
      packet.id = ++this.ackPackets;
      packet.ack = 'data';
      this.acks[packet.id] = lastArg;
      args = args.slice(0, args.length - 1);
    }

    packet.args = args;

    return this.packet(packet);
  };

  /**
   * Disconnects the namespace
   *
   * @api private
   */

  SocketNamespace.prototype.disconnect = function () {
    if (this.name === '') {
      this.socket.disconnect();
    } else {
      this.packet({ type: 'disconnect' });
      this.$emit('disconnect');
    }

    return this;
  };

  /**
   * Handles a packet
   *
   * @api private
   */

  SocketNamespace.prototype.onPacket = function (packet) {
    var self = this;

    function ack () {
      self.packet({
          type: 'ack'
        , args: io.util.toArray(arguments)
        , ackId: packet.id
      });
    };

    switch (packet.type) {
      case 'connect':
        this.$emit('connect');
        break;

      case 'disconnect':
        if (this.name === '') {
          this.socket.onDisconnect(packet.reason || 'booted');
        } else {
          this.$emit('disconnect', packet.reason);
        }
        break;

      case 'message':
      case 'json':
        var params = ['message', packet.data];

        if (packet.ack == 'data') {
          params.push(ack);
        } else if (packet.ack) {
          this.packet({ type: 'ack', ackId: packet.id });
        }

        this.$emit.apply(this, params);
        break;

      case 'event':
        var params = [packet.name].concat(packet.args);

        if (packet.ack == 'data')
          params.push(ack);

        this.$emit.apply(this, params);
        break;

      case 'ack':
        if (this.acks[packet.ackId]) {
          this.acks[packet.ackId].apply(this, packet.args);
          delete this.acks[packet.ackId];
        }
        break;

      case 'error':
        if (packet.advice){
          this.socket.onError(packet);
        } else {
          if (packet.reason == 'unauthorized') {
            this.$emit('connect_failed', packet.reason);
          } else {
            this.$emit('error', packet.reason);
          }
        }
        break;
    }
  };

  /**
   * Flag interface.
   *
   * @api private
   */

  function Flag (nsp, name) {
    this.namespace = nsp;
    this.name = name;
  };

  /**
   * Send a message
   *
   * @api public
   */

  Flag.prototype.send = function () {
    this.namespace.flags[this.name] = true;
    this.namespace.send.apply(this.namespace, arguments);
  };

  /**
   * Emit an event
   *
   * @api public
   */

  Flag.prototype.emit = function () {
    this.namespace.flags[this.name] = true;
    this.namespace.emit.apply(this.namespace, arguments);
  };

})(
    'undefined' != typeof io ? io : module.exports
  , 'undefined' != typeof io ? io : module.parent.exports
);

/**
 * socket.io
 * Copyright(c) 2011 LearnBoost <dev@learnboost.com>
 * MIT Licensed
 */

(function (exports, io, global) {

  /**
   * Expose constructor.
   */

  exports.websocket = WS;

  /**
   * The WebSocket transport uses the HTML5 WebSocket API to establish an
   * persistent connection with the Socket.IO server. This transport will also
   * be inherited by the FlashSocket fallback as it provides a API compatible
   * polyfill for the WebSockets.
   *
   * @constructor
   * @extends {io.Transport}
   * @api public
   */

  function WS (socket) {
    io.Transport.apply(this, arguments);
  };

  /**
   * Inherits from Transport.
   */

  io.util.inherit(WS, io.Transport);

  /**
   * Transport name
   *
   * @api public
   */

  WS.prototype.name = 'websocket';

  /**
   * Initializes a new `WebSocket` connection with the Socket.IO server. We attach
   * all the appropriate listeners to handle the responses from the server.
   *
   * @returns {Transport}
   * @api public
   */

  WS.prototype.open = function () {
    var query = io.util.query(this.socket.options.query)
      , self = this
      , Socket


    if (!Socket) {
      Socket = global.MozWebSocket || global.WebSocket;
    }

    this.websocket = new Socket(this.prepareUrl() + query);

    this.websocket.onopen = function () {
      self.onOpen();
      self.socket.setBuffer(false);
    };
    this.websocket.onmessage = function (ev) {
      self.onData(ev.data);
    };
    this.websocket.onclose = function () {
      self.onClose();
      self.socket.setBuffer(true);
    };
    this.websocket.onerror = function (e) {
      self.onError(e);
    };

    return this;
  };

  /**
   * Send a message to the Socket.IO server. The message will automatically be
   * encoded in the correct message format.
   *
   * @returns {Transport}
   * @api public
   */

  // Do to a bug in the current IDevices browser, we need to wrap the send in a 
  // setTimeout, when they resume from sleeping the browser will crash if 
  // we don't allow the browser time to detect the socket has been closed
  if (io.util.ua.iDevice) {
    WS.prototype.send = function (data) {
      var self = this;
      setTimeout(function() {
         self.websocket.send(data);
      },0);
      return this;
    };
  } else {
    WS.prototype.send = function (data) {
      this.websocket.send(data);
      return this;
    };
  }

  /**
   * Payload
   *
   * @api private
   */

  WS.prototype.payload = function (arr) {
    for (var i = 0, l = arr.length; i < l; i++) {
      this.packet(arr[i]);
    }
    return this;
  };

  /**
   * Disconnect the established `WebSocket` connection.
   *
   * @returns {Transport}
   * @api public
   */

  WS.prototype.close = function () {
    this.websocket.close();
    return this;
  };

  /**
   * Handle the errors that `WebSocket` might be giving when we
   * are attempting to connect or send messages.
   *
   * @param {Error} e The error.
   * @api private
   */

  WS.prototype.onError = function (e) {
    this.socket.onError(e);
  };

  /**
   * Returns the appropriate scheme for the URI generation.
   *
   * @api private
   */
  WS.prototype.scheme = function () {
    return this.socket.options.secure ? 'wss' : 'ws';
  };

  /**
   * Checks if the browser has support for native `WebSockets` and that
   * it's not the polyfill created for the FlashSocket transport.
   *
   * @return {Boolean}
   * @api public
   */

  WS.check = function () {
    return ('WebSocket' in global && !('__addTask' in WebSocket))
          || 'MozWebSocket' in global;
  };

  /**
   * Check if the `WebSocket` transport support cross domain communications.
   *
   * @returns {Boolean}
   * @api public
   */

  WS.xdomainCheck = function () {
    return true;
  };

  /**
   * Add the transport to your public io.transports array.
   *
   * @api private
   */

  io.transports.push('websocket');

})(
    'undefined' != typeof io ? io.Transport : module.exports
  , 'undefined' != typeof io ? io : module.parent.exports
  , this
);

/**
 * socket.io
 * Copyright(c) 2011 LearnBoost <dev@learnboost.com>
 * MIT Licensed
 */

(function (exports, io) {

  /**
   * Expose constructor.
   */

  exports.flashsocket = Flashsocket;

  /**
   * The FlashSocket transport. This is a API wrapper for the HTML5 WebSocket
   * specification. It uses a .swf file to communicate with the server. If you want
   * to serve the .swf file from a other server than where the Socket.IO script is
   * coming from you need to use the insecure version of the .swf. More information
   * about this can be found on the github page.
   *
   * @constructor
   * @extends {io.Transport.websocket}
   * @api public
   */

  function Flashsocket () {
    io.Transport.websocket.apply(this, arguments);
  };

  /**
   * Inherits from Transport.
   */

  io.util.inherit(Flashsocket, io.Transport.websocket);

  /**
   * Transport name
   *
   * @api public
   */

  Flashsocket.prototype.name = 'flashsocket';

  /**
   * Disconnect the established `FlashSocket` connection. This is done by adding a 
   * new task to the FlashSocket. The rest will be handled off by the `WebSocket` 
   * transport.
   *
   * @returns {Transport}
   * @api public
   */

  Flashsocket.prototype.open = function () {
    var self = this
      , args = arguments;

    WebSocket.__addTask(function () {
      io.Transport.websocket.prototype.open.apply(self, args);
    });
    return this;
  };
  
  /**
   * Sends a message to the Socket.IO server. This is done by adding a new
   * task to the FlashSocket. The rest will be handled off by the `WebSocket` 
   * transport.
   *
   * @returns {Transport}
   * @api public
   */

  Flashsocket.prototype.send = function () {
    var self = this, args = arguments;
    WebSocket.__addTask(function () {
      io.Transport.websocket.prototype.send.apply(self, args);
    });
    return this;
  };

  /**
   * Disconnects the established `FlashSocket` connection.
   *
   * @returns {Transport}
   * @api public
   */

  Flashsocket.prototype.close = function () {
    WebSocket.__tasks.length = 0;
    io.Transport.websocket.prototype.close.call(this);
    return this;
  };

  /**
   * The WebSocket fall back needs to append the flash container to the body
   * element, so we need to make sure we have access to it. Or defer the call
   * until we are sure there is a body element.
   *
   * @param {Socket} socket The socket instance that needs a transport
   * @param {Function} fn The callback
   * @api private
   */

  Flashsocket.prototype.ready = function (socket, fn) {
    function init () {
      var options = socket.options
        , port = options['flash policy port']
        , path = [
              'http' + (options.secure ? 's' : '') + ':/'
            , options.host + ':' + options.port
            , options.resource
            , 'static/flashsocket'
            , 'WebSocketMain' + (socket.isXDomain() ? 'Insecure' : '') + '.swf'
          ];

      // Only start downloading the swf file when the checked that this browser
      // actually supports it
      if (!Flashsocket.loaded) {
        if (typeof WEB_SOCKET_SWF_LOCATION === 'undefined') {
          // Set the correct file based on the XDomain settings
          WEB_SOCKET_SWF_LOCATION = path.join('/');
        }

        if (port !== 843) {
          WebSocket.loadFlashPolicyFile('xmlsocket://' + options.host + ':' + port);
        }

        WebSocket.__initialize();
        Flashsocket.loaded = true;
      }

      fn.call(self);
    }

    var self = this;
    if (document.body) return init();

    io.util.load(init);
  };

  /**
   * Check if the FlashSocket transport is supported as it requires that the Adobe
   * Flash Player plug-in version `10.0.0` or greater is installed. And also check if
   * the polyfill is correctly loaded.
   *
   * @returns {Boolean}
   * @api public
   */

  Flashsocket.check = function () {
    if (
        typeof WebSocket == 'undefined'
      || !('__initialize' in WebSocket) || !swfobject
    ) return false;

    return swfobject.getFlashPlayerVersion().major >= 10;
  };

  /**
   * Check if the FlashSocket transport can be used as cross domain / cross origin 
   * transport. Because we can't see which type (secure or insecure) of .swf is used
   * we will just return true.
   *
   * @returns {Boolean}
   * @api public
   */

  Flashsocket.xdomainCheck = function () {
    return true;
  };

  /**
   * Disable AUTO_INITIALIZATION
   */

  if (typeof window != 'undefined') {
    WEB_SOCKET_DISABLE_AUTO_INITIALIZATION = true;
  }

  /**
   * Add the transport to your public io.transports array.
   *
   * @api private
   */

  io.transports.push('flashsocket');
})(
    'undefined' != typeof io ? io.Transport : module.exports
  , 'undefined' != typeof io ? io : module.parent.exports
);
/*	SWFObject v2.2 <http://code.google.com/p/swfobject/> 
	is released under the MIT License <http://www.opensource.org/licenses/mit-license.php> 
*/
if ('undefined' != typeof window) {
var swfobject=function(){var D="undefined",r="object",S="Shockwave Flash",W="ShockwaveFlash.ShockwaveFlash",q="application/x-shockwave-flash",R="SWFObjectExprInst",x="onreadystatechange",O=window,j=document,t=navigator,T=false,U=[h],o=[],N=[],I=[],l,Q,E,B,J=false,a=false,n,G,m=true,M=function(){var aa=typeof j.getElementById!=D&&typeof j.getElementsByTagName!=D&&typeof j.createElement!=D,ah=t.userAgent.toLowerCase(),Y=t.platform.toLowerCase(),ae=Y?/win/.test(Y):/win/.test(ah),ac=Y?/mac/.test(Y):/mac/.test(ah),af=/webkit/.test(ah)?parseFloat(ah.replace(/^.*webkit\/(\d+(\.\d+)?).*$/,"$1")):false,X=!+"\v1",ag=[0,0,0],ab=null;if(typeof t.plugins!=D&&typeof t.plugins[S]==r){ab=t.plugins[S].description;if(ab&&!(typeof t.mimeTypes!=D&&t.mimeTypes[q]&&!t.mimeTypes[q].enabledPlugin)){T=true;X=false;ab=ab.replace(/^.*\s+(\S+\s+\S+$)/,"$1");ag[0]=parseInt(ab.replace(/^(.*)\..*$/,"$1"),10);ag[1]=parseInt(ab.replace(/^.*\.(.*)\s.*$/,"$1"),10);ag[2]=/[a-zA-Z]/.test(ab)?parseInt(ab.replace(/^.*[a-zA-Z]+(.*)$/,"$1"),10):0}}else{if(typeof O[(['Active'].concat('Object').join('X'))]!=D){try{var ad=new window[(['Active'].concat('Object').join('X'))](W);if(ad){ab=ad.GetVariable("$version");if(ab){X=true;ab=ab.split(" ")[1].split(",");ag=[parseInt(ab[0],10),parseInt(ab[1],10),parseInt(ab[2],10)]}}}catch(Z){}}}return{w3:aa,pv:ag,wk:af,ie:X,win:ae,mac:ac}}(),k=function(){if(!M.w3){return}if((typeof j.readyState!=D&&j.readyState=="complete")||(typeof j.readyState==D&&(j.getElementsByTagName("body")[0]||j.body))){f()}if(!J){if(typeof j.addEventListener!=D){j.addEventListener("DOMContentLoaded",f,false)}if(M.ie&&M.win){j.attachEvent(x,function(){if(j.readyState=="complete"){j.detachEvent(x,arguments.callee);f()}});if(O==top){(function(){if(J){return}try{j.documentElement.doScroll("left")}catch(X){setTimeout(arguments.callee,0);return}f()})()}}if(M.wk){(function(){if(J){return}if(!/loaded|complete/.test(j.readyState)){setTimeout(arguments.callee,0);return}f()})()}s(f)}}();function f(){if(J){return}try{var Z=j.getElementsByTagName("body")[0].appendChild(C("span"));Z.parentNode.removeChild(Z)}catch(aa){return}J=true;var X=U.length;for(var Y=0;Y<X;Y++){U[Y]()}}function K(X){if(J){X()}else{U[U.length]=X}}function s(Y){if(typeof O.addEventListener!=D){O.addEventListener("load",Y,false)}else{if(typeof j.addEventListener!=D){j.addEventListener("load",Y,false)}else{if(typeof O.attachEvent!=D){i(O,"onload",Y)}else{if(typeof O.onload=="function"){var X=O.onload;O.onload=function(){X();Y()}}else{O.onload=Y}}}}}function h(){if(T){V()}else{H()}}function V(){var X=j.getElementsByTagName("body")[0];var aa=C(r);aa.setAttribute("type",q);var Z=X.appendChild(aa);if(Z){var Y=0;(function(){if(typeof Z.GetVariable!=D){var ab=Z.GetVariable("$version");if(ab){ab=ab.split(" ")[1].split(",");M.pv=[parseInt(ab[0],10),parseInt(ab[1],10),parseInt(ab[2],10)]}}else{if(Y<10){Y++;setTimeout(arguments.callee,10);return}}X.removeChild(aa);Z=null;H()})()}else{H()}}function H(){var ag=o.length;if(ag>0){for(var af=0;af<ag;af++){var Y=o[af].id;var ab=o[af].callbackFn;var aa={success:false,id:Y};if(M.pv[0]>0){var ae=c(Y);if(ae){if(F(o[af].swfVersion)&&!(M.wk&&M.wk<312)){w(Y,true);if(ab){aa.success=true;aa.ref=z(Y);ab(aa)}}else{if(o[af].expressInstall&&A()){var ai={};ai.data=o[af].expressInstall;ai.width=ae.getAttribute("width")||"0";ai.height=ae.getAttribute("height")||"0";if(ae.getAttribute("class")){ai.styleclass=ae.getAttribute("class")}if(ae.getAttribute("align")){ai.align=ae.getAttribute("align")}var ah={};var X=ae.getElementsByTagName("param");var ac=X.length;for(var ad=0;ad<ac;ad++){if(X[ad].getAttribute("name").toLowerCase()!="movie"){ah[X[ad].getAttribute("name")]=X[ad].getAttribute("value")}}P(ai,ah,Y,ab)}else{p(ae);if(ab){ab(aa)}}}}}else{w(Y,true);if(ab){var Z=z(Y);if(Z&&typeof Z.SetVariable!=D){aa.success=true;aa.ref=Z}ab(aa)}}}}}function z(aa){var X=null;var Y=c(aa);if(Y&&Y.nodeName=="OBJECT"){if(typeof Y.SetVariable!=D){X=Y}else{var Z=Y.getElementsByTagName(r)[0];if(Z){X=Z}}}return X}function A(){return !a&&F("6.0.65")&&(M.win||M.mac)&&!(M.wk&&M.wk<312)}function P(aa,ab,X,Z){a=true;E=Z||null;B={success:false,id:X};var ae=c(X);if(ae){if(ae.nodeName=="OBJECT"){l=g(ae);Q=null}else{l=ae;Q=X}aa.id=R;if(typeof aa.width==D||(!/%$/.test(aa.width)&&parseInt(aa.width,10)<310)){aa.width="310"}if(typeof aa.height==D||(!/%$/.test(aa.height)&&parseInt(aa.height,10)<137)){aa.height="137"}j.title=j.title.slice(0,47)+" - Flash Player Installation";var ad=M.ie&&M.win?(['Active'].concat('').join('X')):"PlugIn",ac="MMredirectURL="+O.location.toString().replace(/&/g,"%26")+"&MMplayerType="+ad+"&MMdoctitle="+j.title;if(typeof ab.flashvars!=D){ab.flashvars+="&"+ac}else{ab.flashvars=ac}if(M.ie&&M.win&&ae.readyState!=4){var Y=C("div");X+="SWFObjectNew";Y.setAttribute("id",X);ae.parentNode.insertBefore(Y,ae);ae.style.display="none";(function(){if(ae.readyState==4){ae.parentNode.removeChild(ae)}else{setTimeout(arguments.callee,10)}})()}u(aa,ab,X)}}function p(Y){if(M.ie&&M.win&&Y.readyState!=4){var X=C("div");Y.parentNode.insertBefore(X,Y);X.parentNode.replaceChild(g(Y),X);Y.style.display="none";(function(){if(Y.readyState==4){Y.parentNode.removeChild(Y)}else{setTimeout(arguments.callee,10)}})()}else{Y.parentNode.replaceChild(g(Y),Y)}}function g(ab){var aa=C("div");if(M.win&&M.ie){aa.innerHTML=ab.innerHTML}else{var Y=ab.getElementsByTagName(r)[0];if(Y){var ad=Y.childNodes;if(ad){var X=ad.length;for(var Z=0;Z<X;Z++){if(!(ad[Z].nodeType==1&&ad[Z].nodeName=="PARAM")&&!(ad[Z].nodeType==8)){aa.appendChild(ad[Z].cloneNode(true))}}}}}return aa}function u(ai,ag,Y){var X,aa=c(Y);if(M.wk&&M.wk<312){return X}if(aa){if(typeof ai.id==D){ai.id=Y}if(M.ie&&M.win){var ah="";for(var ae in ai){if(ai[ae]!=Object.prototype[ae]){if(ae.toLowerCase()=="data"){ag.movie=ai[ae]}else{if(ae.toLowerCase()=="styleclass"){ah+=' class="'+ai[ae]+'"'}else{if(ae.toLowerCase()!="classid"){ah+=" "+ae+'="'+ai[ae]+'"'}}}}}var af="";for(var ad in ag){if(ag[ad]!=Object.prototype[ad]){af+='<param name="'+ad+'" value="'+ag[ad]+'" />'}}aa.outerHTML='<object classid="clsid:D27CDB6E-AE6D-11cf-96B8-444553540000"'+ah+">"+af+"</object>";N[N.length]=ai.id;X=c(ai.id)}else{var Z=C(r);Z.setAttribute("type",q);for(var ac in ai){if(ai[ac]!=Object.prototype[ac]){if(ac.toLowerCase()=="styleclass"){Z.setAttribute("class",ai[ac])}else{if(ac.toLowerCase()!="classid"){Z.setAttribute(ac,ai[ac])}}}}for(var ab in ag){if(ag[ab]!=Object.prototype[ab]&&ab.toLowerCase()!="movie"){e(Z,ab,ag[ab])}}aa.parentNode.replaceChild(Z,aa);X=Z}}return X}function e(Z,X,Y){var aa=C("param");aa.setAttribute("name",X);aa.setAttribute("value",Y);Z.appendChild(aa)}function y(Y){var X=c(Y);if(X&&X.nodeName=="OBJECT"){if(M.ie&&M.win){X.style.display="none";(function(){if(X.readyState==4){b(Y)}else{setTimeout(arguments.callee,10)}})()}else{X.parentNode.removeChild(X)}}}function b(Z){var Y=c(Z);if(Y){for(var X in Y){if(typeof Y[X]=="function"){Y[X]=null}}Y.parentNode.removeChild(Y)}}function c(Z){var X=null;try{X=j.getElementById(Z)}catch(Y){}return X}function C(X){return j.createElement(X)}function i(Z,X,Y){Z.attachEvent(X,Y);I[I.length]=[Z,X,Y]}function F(Z){var Y=M.pv,X=Z.split(".");X[0]=parseInt(X[0],10);X[1]=parseInt(X[1],10)||0;X[2]=parseInt(X[2],10)||0;return(Y[0]>X[0]||(Y[0]==X[0]&&Y[1]>X[1])||(Y[0]==X[0]&&Y[1]==X[1]&&Y[2]>=X[2]))?true:false}function v(ac,Y,ad,ab){if(M.ie&&M.mac){return}var aa=j.getElementsByTagName("head")[0];if(!aa){return}var X=(ad&&typeof ad=="string")?ad:"screen";if(ab){n=null;G=null}if(!n||G!=X){var Z=C("style");Z.setAttribute("type","text/css");Z.setAttribute("media",X);n=aa.appendChild(Z);if(M.ie&&M.win&&typeof j.styleSheets!=D&&j.styleSheets.length>0){n=j.styleSheets[j.styleSheets.length-1]}G=X}if(M.ie&&M.win){if(n&&typeof n.addRule==r){n.addRule(ac,Y)}}else{if(n&&typeof j.createTextNode!=D){n.appendChild(j.createTextNode(ac+" {"+Y+"}"))}}}function w(Z,X){if(!m){return}var Y=X?"visible":"hidden";if(J&&c(Z)){c(Z).style.visibility=Y}else{v("#"+Z,"visibility:"+Y)}}function L(Y){var Z=/[\\\"<>\.;]/;var X=Z.exec(Y)!=null;return X&&typeof encodeURIComponent!=D?encodeURIComponent(Y):Y}var d=function(){if(M.ie&&M.win){window.attachEvent("onunload",function(){var ac=I.length;for(var ab=0;ab<ac;ab++){I[ab][0].detachEvent(I[ab][1],I[ab][2])}var Z=N.length;for(var aa=0;aa<Z;aa++){y(N[aa])}for(var Y in M){M[Y]=null}M=null;for(var X in swfobject){swfobject[X]=null}swfobject=null})}}();return{registerObject:function(ab,X,aa,Z){if(M.w3&&ab&&X){var Y={};Y.id=ab;Y.swfVersion=X;Y.expressInstall=aa;Y.callbackFn=Z;o[o.length]=Y;w(ab,false)}else{if(Z){Z({success:false,id:ab})}}},getObjectById:function(X){if(M.w3){return z(X)}},embedSWF:function(ab,ah,ae,ag,Y,aa,Z,ad,af,ac){var X={success:false,id:ah};if(M.w3&&!(M.wk&&M.wk<312)&&ab&&ah&&ae&&ag&&Y){w(ah,false);K(function(){ae+="";ag+="";var aj={};if(af&&typeof af===r){for(var al in af){aj[al]=af[al]}}aj.data=ab;aj.width=ae;aj.height=ag;var am={};if(ad&&typeof ad===r){for(var ak in ad){am[ak]=ad[ak]}}if(Z&&typeof Z===r){for(var ai in Z){if(typeof am.flashvars!=D){am.flashvars+="&"+ai+"="+Z[ai]}else{am.flashvars=ai+"="+Z[ai]}}}if(F(Y)){var an=u(aj,am,ah);if(aj.id==ah){w(ah,true)}X.success=true;X.ref=an}else{if(aa&&A()){aj.data=aa;P(aj,am,ah,ac);return}else{w(ah,true)}}if(ac){ac(X)}})}else{if(ac){ac(X)}}},switchOffAutoHideShow:function(){m=false},ua:M,getFlashPlayerVersion:function(){return{major:M.pv[0],minor:M.pv[1],release:M.pv[2]}},hasFlashPlayerVersion:F,createSWF:function(Z,Y,X){if(M.w3){return u(Z,Y,X)}else{return undefined}},showExpressInstall:function(Z,aa,X,Y){if(M.w3&&A()){P(Z,aa,X,Y)}},removeSWF:function(X){if(M.w3){y(X)}},createCSS:function(aa,Z,Y,X){if(M.w3){v(aa,Z,Y,X)}},addDomLoadEvent:K,addLoadEvent:s,getQueryParamValue:function(aa){var Z=j.location.search||j.location.hash;if(Z){if(/\?/.test(Z)){Z=Z.split("?")[1]}if(aa==null){return L(Z)}var Y=Z.split("&");for(var X=0;X<Y.length;X++){if(Y[X].substring(0,Y[X].indexOf("="))==aa){return L(Y[X].substring((Y[X].indexOf("=")+1)))}}}return""},expressInstallCallback:function(){if(a){var X=c(R);if(X&&l){X.parentNode.replaceChild(l,X);if(Q){w(Q,true);if(M.ie&&M.win){l.style.display="block"}}if(E){E(B)}}a=false}}}}();
}
// Copyright: Hiroshi Ichikawa <http://gimite.net/en/>
// License: New BSD License
// Reference: http://dev.w3.org/html5/websockets/
// Reference: http://tools.ietf.org/html/draft-hixie-thewebsocketprotocol

(function() {
  
  if ('undefined' == typeof window || window.WebSocket) return;

  var console = window.console;
  if (!console || !console.log || !console.error) {
    console = {log: function(){ }, error: function(){ }};
  }
  
  if (!swfobject.hasFlashPlayerVersion("10.0.0")) {
    console.error("Flash Player >= 10.0.0 is required.");
    return;
  }
  if (location.protocol == "file:") {
    console.error(
      "WARNING: web-socket-js doesn't work in file:///... URL " +
      "unless you set Flash Security Settings properly. " +
      "Open the page via Web server i.e. http://...");
  }

  /**
   * This class represents a faux web socket.
   * @param {string} url
   * @param {array or string} protocols
   * @param {string} proxyHost
   * @param {int} proxyPort
   * @param {string} headers
   */
  WebSocket = function(url, protocols, proxyHost, proxyPort, headers) {
    var self = this;
    self.__id = WebSocket.__nextId++;
    WebSocket.__instances[self.__id] = self;
    self.readyState = WebSocket.CONNECTING;
    self.bufferedAmount = 0;
    self.__events = {};
    if (!protocols) {
      protocols = [];
    } else if (typeof protocols == "string") {
      protocols = [protocols];
    }
    // Uses setTimeout() to make sure __createFlash() runs after the caller sets ws.onopen etc.
    // Otherwise, when onopen fires immediately, onopen is called before it is set.
    setTimeout(function() {
      WebSocket.__addTask(function() {
        WebSocket.__flash.create(
            self.__id, url, protocols, proxyHost || null, proxyPort || 0, headers || null);
      });
    }, 0);
  };

  /**
   * Send data to the web socket.
   * @param {string} data  The data to send to the socket.
   * @return {boolean}  True for success, false for failure.
   */
  WebSocket.prototype.send = function(data) {
    if (this.readyState == WebSocket.CONNECTING) {
      throw "INVALID_STATE_ERR: Web Socket connection has not been established";
    }
    // We use encodeURIComponent() here, because FABridge doesn't work if
    // the argument includes some characters. We don't use escape() here
    // because of this:
    // https://developer.mozilla.org/en/Core_JavaScript_1.5_Guide/Functions#escape_and_unescape_Functions
    // But it looks decodeURIComponent(encodeURIComponent(s)) doesn't
    // preserve all Unicode characters either e.g. "\uffff" in Firefox.
    // Note by wtritch: Hopefully this will not be necessary using ExternalInterface.  Will require
    // additional testing.
    var result = WebSocket.__flash.send(this.__id, encodeURIComponent(data));
    if (result < 0) { // success
      return true;
    } else {
      this.bufferedAmount += result;
      return false;
    }
  };

  /**
   * Close this web socket gracefully.
   */
  WebSocket.prototype.close = function() {
    if (this.readyState == WebSocket.CLOSED || this.readyState == WebSocket.CLOSING) {
      return;
    }
    this.readyState = WebSocket.CLOSING;
    WebSocket.__flash.close(this.__id);
  };

  /**
   * Implementation of {@link <a href="http://www.w3.org/TR/DOM-Level-2-Events/events.html#Events-registration">DOM 2 EventTarget Interface</a>}
   *
   * @param {string} type
   * @param {function} listener
   * @param {boolean} useCapture
   * @return void
   */
  WebSocket.prototype.addEventListener = function(type, listener, useCapture) {
    if (!(type in this.__events)) {
      this.__events[type] = [];
    }
    this.__events[type].push(listener);
  };

  /**
   * Implementation of {@link <a href="http://www.w3.org/TR/DOM-Level-2-Events/events.html#Events-registration">DOM 2 EventTarget Interface</a>}
   *
   * @param {string} type
   * @param {function} listener
   * @param {boolean} useCapture
   * @return void
   */
  WebSocket.prototype.removeEventListener = function(type, listener, useCapture) {
    if (!(type in this.__events)) return;
    var events = this.__events[type];
    for (var i = events.length - 1; i >= 0; --i) {
      if (events[i] === listener) {
        events.splice(i, 1);
        break;
      }
    }
  };

  /**
   * Implementation of {@link <a href="http://www.w3.org/TR/DOM-Level-2-Events/events.html#Events-registration">DOM 2 EventTarget Interface</a>}
   *
   * @param {Event} event
   * @return void
   */
  WebSocket.prototype.dispatchEvent = function(event) {
    var events = this.__events[event.type] || [];
    for (var i = 0; i < events.length; ++i) {
      events[i](event);
    }
    var handler = this["on" + event.type];
    if (handler) handler(event);
  };

  /**
   * Handles an event from Flash.
   * @param {Object} flashEvent
   */
  WebSocket.prototype.__handleEvent = function(flashEvent) {
    if ("readyState" in flashEvent) {
      this.readyState = flashEvent.readyState;
    }
    if ("protocol" in flashEvent) {
      this.protocol = flashEvent.protocol;
    }
    
    var jsEvent;
    if (flashEvent.type == "open" || flashEvent.type == "error") {
      jsEvent = this.__createSimpleEvent(flashEvent.type);
    } else if (flashEvent.type == "close") {
      // TODO implement jsEvent.wasClean
      jsEvent = this.__createSimpleEvent("close");
    } else if (flashEvent.type == "message") {
      var data = decodeURIComponent(flashEvent.message);
      jsEvent = this.__createMessageEvent("message", data);
    } else {
      throw "unknown event type: " + flashEvent.type;
    }
    
    this.dispatchEvent(jsEvent);
  };
  
  WebSocket.prototype.__createSimpleEvent = function(type) {
    if (document.createEvent && window.Event) {
      var event = document.createEvent("Event");
      event.initEvent(type, false, false);
      return event;
    } else {
      return {type: type, bubbles: false, cancelable: false};
    }
  };
  
  WebSocket.prototype.__createMessageEvent = function(type, data) {
    if (document.createEvent && window.MessageEvent && !window.opera) {
      var event = document.createEvent("MessageEvent");
      event.initMessageEvent("message", false, false, data, null, null, window, null);
      return event;
    } else {
      // IE and Opera, the latter one truncates the data parameter after any 0x00 bytes.
      return {type: type, data: data, bubbles: false, cancelable: false};
    }
  };
  
  /**
   * Define the WebSocket readyState enumeration.
   */
  WebSocket.CONNECTING = 0;
  WebSocket.OPEN = 1;
  WebSocket.CLOSING = 2;
  WebSocket.CLOSED = 3;

  WebSocket.__flash = null;
  WebSocket.__instances = {};
  WebSocket.__tasks = [];
  WebSocket.__nextId = 0;
  
  /**
   * Load a new flash security policy file.
   * @param {string} url
   */
  WebSocket.loadFlashPolicyFile = function(url){
    WebSocket.__addTask(function() {
      WebSocket.__flash.loadManualPolicyFile(url);
    });
  };

  /**
   * Loads WebSocketMain.swf and creates WebSocketMain object in Flash.
   */
  WebSocket.__initialize = function() {
    if (WebSocket.__flash) return;
    
    if (WebSocket.__swfLocation) {
      // For backword compatibility.
      window.WEB_SOCKET_SWF_LOCATION = WebSocket.__swfLocation;
    }
    if (!window.WEB_SOCKET_SWF_LOCATION) {
      console.error("[WebSocket] set WEB_SOCKET_SWF_LOCATION to location of WebSocketMain.swf");
      return;
    }
    var container = document.createElement("div");
    container.id = "webSocketContainer";
    // Hides Flash box. We cannot use display: none or visibility: hidden because it prevents
    // Flash from loading at least in IE. So we move it out of the screen at (-100, -100).
    // But this even doesn't work with Flash Lite (e.g. in Droid Incredible). So with Flash
    // Lite, we put it at (0, 0). This shows 1x1 box visible at left-top corner but this is
    // the best we can do as far as we know now.
    container.style.position = "absolute";
    if (WebSocket.__isFlashLite()) {
      container.style.left = "0px";
      container.style.top = "0px";
    } else {
      container.style.left = "-100px";
      container.style.top = "-100px";
    }
    var holder = document.createElement("div");
    holder.id = "webSocketFlash";
    container.appendChild(holder);
    document.body.appendChild(container);
    // See this article for hasPriority:
    // http://help.adobe.com/en_US/as3/mobile/WS4bebcd66a74275c36cfb8137124318eebc6-7ffd.html
    swfobject.embedSWF(
      WEB_SOCKET_SWF_LOCATION,
      "webSocketFlash",
      "1" /* width */,
      "1" /* height */,
      "10.0.0" /* SWF version */,
      null,
      null,
      {hasPriority: true, swliveconnect : true, allowScriptAccess: "always"},
      null,
      function(e) {
        if (!e.success) {
          console.error("[WebSocket] swfobject.embedSWF failed");
        }
      });
  };
  
  /**
   * Called by Flash to notify JS that it's fully loaded and ready
   * for communication.
   */
  WebSocket.__onFlashInitialized = function() {
    // We need to set a timeout here to avoid round-trip calls
    // to flash during the initialization process.
    setTimeout(function() {
      WebSocket.__flash = document.getElementById("webSocketFlash");
      WebSocket.__flash.setCallerUrl(location.href);
      WebSocket.__flash.setDebug(!!window.WEB_SOCKET_DEBUG);
      for (var i = 0; i < WebSocket.__tasks.length; ++i) {
        WebSocket.__tasks[i]();
      }
      WebSocket.__tasks = [];
    }, 0);
  };
  
  /**
   * Called by Flash to notify WebSockets events are fired.
   */
  WebSocket.__onFlashEvent = function() {
    setTimeout(function() {
      try {
        // Gets events using receiveEvents() instead of getting it from event object
        // of Flash event. This is to make sure to keep message order.
        // It seems sometimes Flash events don't arrive in the same order as they are sent.
        var events = WebSocket.__flash.receiveEvents();
        for (var i = 0; i < events.length; ++i) {
          WebSocket.__instances[events[i].webSocketId].__handleEvent(events[i]);
        }
      } catch (e) {
        console.error(e);
      }
    }, 0);
    return true;
  };
  
  // Called by Flash.
  WebSocket.__log = function(message) {
    console.log(decodeURIComponent(message));
  };
  
  // Called by Flash.
  WebSocket.__error = function(message) {
    console.error(decodeURIComponent(message));
  };
  
  WebSocket.__addTask = function(task) {
    if (WebSocket.__flash) {
      task();
    } else {
      WebSocket.__tasks.push(task);
    }
  };
  
  /**
   * Test if the browser is running flash lite.
   * @return {boolean} True if flash lite is running, false otherwise.
   */
  WebSocket.__isFlashLite = function() {
    if (!window.navigator || !window.navigator.mimeTypes) {
      return false;
    }
    var mimeType = window.navigator.mimeTypes["application/x-shockwave-flash"];
    if (!mimeType || !mimeType.enabledPlugin || !mimeType.enabledPlugin.filename) {
      return false;
    }
    return mimeType.enabledPlugin.filename.match(/flashlite/i) ? true : false;
  };
  
  if (!window.WEB_SOCKET_DISABLE_AUTO_INITIALIZATION) {
    if (window.addEventListener) {
      window.addEventListener("load", function(){
        WebSocket.__initialize();
      }, false);
    } else {
      window.attachEvent("onload", function(){
        WebSocket.__initialize();
      });
    }
  }
  
})();

/**
 * socket.io
 * Copyright(c) 2011 LearnBoost <dev@learnboost.com>
 * MIT Licensed
 */

(function (exports, io, global) {

  /**
   * Expose constructor.
   *
   * @api public
   */

  exports.XHR = XHR;

  /**
   * XHR constructor
   *
   * @costructor
   * @api public
   */

  function XHR (socket) {
    if (!socket) return;

    io.Transport.apply(this, arguments);
    this.sendBuffer = [];
  };

  /**
   * Inherits from Transport.
   */

  io.util.inherit(XHR, io.Transport);

  /**
   * Establish a connection
   *
   * @returns {Transport}
   * @api public
   */

  XHR.prototype.open = function () {
    this.socket.setBuffer(false);
    this.onOpen();
    this.get();

    // we need to make sure the request succeeds since we have no indication
    // whether the request opened or not until it succeeded.
    this.setCloseTimeout();

    return this;
  };

  /**
   * Check if we need to send data to the Socket.IO server, if we have data in our
   * buffer we encode it and forward it to the `post` method.
   *
   * @api private
   */

  XHR.prototype.payload = function (payload) {
    var msgs = [];

    for (var i = 0, l = payload.length; i < l; i++) {
      msgs.push(io.parser.encodePacket(payload[i]));
    }

    this.send(io.parser.encodePayload(msgs));
  };

  /**
   * Send data to the Socket.IO server.
   *
   * @param data The message
   * @returns {Transport}
   * @api public
   */

  XHR.prototype.send = function (data) {
    this.post(data);
    return this;
  };

  /**
   * Posts a encoded message to the Socket.IO server.
   *
   * @param {String} data A encoded message.
   * @api private
   */

  function empty () { };

  XHR.prototype.post = function (data) {
    var self = this;
    this.socket.setBuffer(true);

    function stateChange () {
      if (this.readyState == 4) {
        this.onreadystatechange = empty;
        self.posting = false;

        if (this.status == 200){
          self.socket.setBuffer(false);
        } else {
          self.onClose();
        }
      }
    }

    function onload () {
      this.onload = empty;
      self.socket.setBuffer(false);
    };

    this.sendXHR = this.request('POST');

    if (global.XDomainRequest && this.sendXHR instanceof XDomainRequest) {
      this.sendXHR.onload = this.sendXHR.onerror = onload;
    } else {
      this.sendXHR.onreadystatechange = stateChange;
    }

    this.sendXHR.send(data);
  };

  /**
   * Disconnects the established `XHR` connection.
   *
   * @returns {Transport}
   * @api public
   */

  XHR.prototype.close = function () {
    this.onClose();
    return this;
  };

  /**
   * Generates a configured XHR request
   *
   * @param {String} url The url that needs to be requested.
   * @param {String} method The method the request should use.
   * @returns {XMLHttpRequest}
   * @api private
   */

  XHR.prototype.request = function (method) {
    var req = io.util.request(this.socket.isXDomain())
      , query = io.util.query(this.socket.options.query, 't=' + +new Date);

    req.open(method || 'GET', this.prepareUrl() + query, true);

    if (method == 'POST') {
      try {
        if (req.setRequestHeader) {
          req.setRequestHeader('Content-type', 'text/plain;charset=UTF-8');
        } else {
          // XDomainRequest
          req.contentType = 'text/plain';
        }
      } catch (e) {}
    }

    return req;
  };

  /**
   * Returns the scheme to use for the transport URLs.
   *
   * @api private
   */

  XHR.prototype.scheme = function () {
    return this.socket.options.secure ? 'https' : 'http';
  };

  /**
   * Check if the XHR transports are supported
   *
   * @param {Boolean} xdomain Check if we support cross domain requests.
   * @returns {Boolean}
   * @api public
   */

  XHR.check = function (socket, xdomain) {
    try {
      var request = io.util.request(xdomain),
          usesXDomReq = (global.XDomainRequest && request instanceof XDomainRequest),
          socketProtocol = (socket && socket.options && socket.options.secure ? 'https:' : 'http:'),
          isXProtocol = (global.location && socketProtocol != global.location.protocol);
      if (request && !(usesXDomReq && isXProtocol)) {
        return true;
      }
    } catch(e) {}

    return false;
  };

  /**
   * Check if the XHR transport supports cross domain requests.
   *
   * @returns {Boolean}
   * @api public
   */

  XHR.xdomainCheck = function (socket) {
    return XHR.check(socket, true);
  };

})(
    'undefined' != typeof io ? io.Transport : module.exports
  , 'undefined' != typeof io ? io : module.parent.exports
  , this
);
/**
 * socket.io
 * Copyright(c) 2011 LearnBoost <dev@learnboost.com>
 * MIT Licensed
 */

(function (exports, io) {

  /**
   * Expose constructor.
   */

  exports.htmlfile = HTMLFile;

  /**
   * The HTMLFile transport creates a `forever iframe` based transport
   * for Internet Explorer. Regular forever iframe implementations will 
   * continuously trigger the browsers buzy indicators. If the forever iframe
   * is created inside a `htmlfile` these indicators will not be trigged.
   *
   * @constructor
   * @extends {io.Transport.XHR}
   * @api public
   */

  function HTMLFile (socket) {
    io.Transport.XHR.apply(this, arguments);
  };

  /**
   * Inherits from XHR transport.
   */

  io.util.inherit(HTMLFile, io.Transport.XHR);

  /**
   * Transport name
   *
   * @api public
   */

  HTMLFile.prototype.name = 'htmlfile';

  /**
   * Creates a new Ac...eX `htmlfile` with a forever loading iframe
   * that can be used to listen to messages. Inside the generated
   * `htmlfile` a reference will be made to the HTMLFile transport.
   *
   * @api private
   */

  HTMLFile.prototype.get = function () {
    this.doc = new window[(['Active'].concat('Object').join('X'))]('htmlfile');
    this.doc.open();
    this.doc.write('<html></html>');
    this.doc.close();
    this.doc.parentWindow.s = this;

    var iframeC = this.doc.createElement('div');
    iframeC.className = 'socketio';

    this.doc.body.appendChild(iframeC);
    this.iframe = this.doc.createElement('iframe');

    iframeC.appendChild(this.iframe);

    var self = this
      , query = io.util.query(this.socket.options.query, 't='+ +new Date);

    this.iframe.src = this.prepareUrl() + query;

    io.util.on(window, 'unload', function () {
      self.destroy();
    });
  };

  /**
   * The Socket.IO server will write script tags inside the forever
   * iframe, this function will be used as callback for the incoming
   * information.
   *
   * @param {String} data The message
   * @param {document} doc Reference to the context
   * @api private
   */

  HTMLFile.prototype._ = function (data, doc) {
    this.onData(data);
    try {
      var script = doc.getElementsByTagName('script')[0];
      script.parentNode.removeChild(script);
    } catch (e) { }
  };

  /**
   * Destroy the established connection, iframe and `htmlfile`.
   * And calls the `CollectGarbage` function of Internet Explorer
   * to release the memory.
   *
   * @api private
   */

  HTMLFile.prototype.destroy = function () {
    if (this.iframe){
      try {
        this.iframe.src = 'about:blank';
      } catch(e){}

      this.doc = null;
      this.iframe.parentNode.removeChild(this.iframe);
      this.iframe = null;

      CollectGarbage();
    }
  };

  /**
   * Disconnects the established connection.
   *
   * @returns {Transport} Chaining.
   * @api public
   */

  HTMLFile.prototype.close = function () {
    this.destroy();
    return io.Transport.XHR.prototype.close.call(this);
  };

  /**
   * Checks if the browser supports this transport. The browser
   * must have an `Ac...eXObject` implementation.
   *
   * @return {Boolean}
   * @api public
   */

  HTMLFile.check = function (socket) {
    if (typeof window != "undefined" && (['Active'].concat('Object').join('X')) in window){
      try {
        var a = new window[(['Active'].concat('Object').join('X'))]('htmlfile');
        return a && io.Transport.XHR.check(socket);
      } catch(e){}
    }
    return false;
  };

  /**
   * Check if cross domain requests are supported.
   *
   * @returns {Boolean}
   * @api public
   */

  HTMLFile.xdomainCheck = function () {
    // we can probably do handling for sub-domains, we should
    // test that it's cross domain but a subdomain here
    return false;
  };

  /**
   * Add the transport to your public io.transports array.
   *
   * @api private
   */

  io.transports.push('htmlfile');

})(
    'undefined' != typeof io ? io.Transport : module.exports
  , 'undefined' != typeof io ? io : module.parent.exports
);

/**
 * socket.io
 * Copyright(c) 2011 LearnBoost <dev@learnboost.com>
 * MIT Licensed
 */

(function (exports, io, global) {

  /**
   * Expose constructor.
   */

  exports['xhr-polling'] = XHRPolling;

  /**
   * The XHR-polling transport uses long polling XHR requests to create a
   * "persistent" connection with the server.
   *
   * @constructor
   * @api public
   */

  function XHRPolling () {
    io.Transport.XHR.apply(this, arguments);
  };

  /**
   * Inherits from XHR transport.
   */

  io.util.inherit(XHRPolling, io.Transport.XHR);

  /**
   * Merge the properties from XHR transport
   */

  io.util.merge(XHRPolling, io.Transport.XHR);

  /**
   * Transport name
   *
   * @api public
   */

  XHRPolling.prototype.name = 'xhr-polling';

  /**
   * Indicates whether heartbeats is enabled for this transport
   *
   * @api private
   */

  XHRPolling.prototype.heartbeats = function () {
    return false;
  };

  /** 
   * Establish a connection, for iPhone and Android this will be done once the page
   * is loaded.
   *
   * @returns {Transport} Chaining.
   * @api public
   */

  XHRPolling.prototype.open = function () {
    var self = this;

    io.Transport.XHR.prototype.open.call(self);
    return false;
  };

  /**
   * Starts a XHR request to wait for incoming messages.
   *
   * @api private
   */

  function empty () {};

  XHRPolling.prototype.get = function () {
    if (!this.isOpen) return;

    var self = this;

    function stateChange () {
      if (this.readyState == 4) {
        this.onreadystatechange = empty;

        if (this.status == 200) {
          self.onData(this.responseText);
          self.get();
        } else {
          self.onClose();
        }
      }
    };

    function onload () {
      this.onload = empty;
      this.onerror = empty;
      self.retryCounter = 1;
      self.onData(this.responseText);
      self.get();
    };

    function onerror () {
      self.retryCounter ++;
      if(!self.retryCounter || self.retryCounter > 3) {
        self.onClose();  
      } else {
        self.get();
      }
    };

    this.xhr = this.request();

    if (global.XDomainRequest && this.xhr instanceof XDomainRequest) {
      this.xhr.onload = onload;
      this.xhr.onerror = onerror;
    } else {
      this.xhr.onreadystatechange = stateChange;
    }

    this.xhr.send(null);
  };

  /**
   * Handle the unclean close behavior.
   *
   * @api private
   */

  XHRPolling.prototype.onClose = function () {
    io.Transport.XHR.prototype.onClose.call(this);

    if (this.xhr) {
      this.xhr.onreadystatechange = this.xhr.onload = this.xhr.onerror = empty;
      try {
        this.xhr.abort();
      } catch(e){}
      this.xhr = null;
    }
  };

  /**
   * Webkit based browsers show a infinit spinner when you start a XHR request
   * before the browsers onload event is called so we need to defer opening of
   * the transport until the onload event is called. Wrapping the cb in our
   * defer method solve this.
   *
   * @param {Socket} socket The socket instance that needs a transport
   * @param {Function} fn The callback
   * @api private
   */

  XHRPolling.prototype.ready = function (socket, fn) {
    var self = this;

    io.util.defer(function () {
      fn.call(self);
    });
  };

  /**
   * Add the transport to your public io.transports array.
   *
   * @api private
   */

  io.transports.push('xhr-polling');

})(
    'undefined' != typeof io ? io.Transport : module.exports
  , 'undefined' != typeof io ? io : module.parent.exports
  , this
);

/**
 * socket.io
 * Copyright(c) 2011 LearnBoost <dev@learnboost.com>
 * MIT Licensed
 */

(function (exports, io, global) {
  /**
   * There is a way to hide the loading indicator in Firefox. If you create and
   * remove a iframe it will stop showing the current loading indicator.
   * Unfortunately we can't feature detect that and UA sniffing is evil.
   *
   * @api private
   */

  var indicator = global.document && "MozAppearance" in
    global.document.documentElement.style;

  /**
   * Expose constructor.
   */

  exports['jsonp-polling'] = JSONPPolling;

  /**
   * The JSONP transport creates an persistent connection by dynamically
   * inserting a script tag in the page. This script tag will receive the
   * information of the Socket.IO server. When new information is received
   * it creates a new script tag for the new data stream.
   *
   * @constructor
   * @extends {io.Transport.xhr-polling}
   * @api public
   */

  function JSONPPolling (socket) {
    io.Transport['xhr-polling'].apply(this, arguments);

    this.index = io.j.length;

    var self = this;

    io.j.push(function (msg) {
      self._(msg);
    });
  };

  /**
   * Inherits from XHR polling transport.
   */

  io.util.inherit(JSONPPolling, io.Transport['xhr-polling']);

  /**
   * Transport name
   *
   * @api public
   */

  JSONPPolling.prototype.name = 'jsonp-polling';

  /**
   * Posts a encoded message to the Socket.IO server using an iframe.
   * The iframe is used because script tags can create POST based requests.
   * The iframe is positioned outside of the view so the user does not
   * notice it's existence.
   *
   * @param {String} data A encoded message.
   * @api private
   */

  JSONPPolling.prototype.post = function (data) {
    var self = this
      , query = io.util.query(
             this.socket.options.query
          , 't='+ (+new Date) + '&i=' + this.index
        );

    if (!this.form) {
      var form = document.createElement('form')
        , area = document.createElement('textarea')
        , id = this.iframeId = 'socketio_iframe_' + this.index
        , iframe;

      form.className = 'socketio';
      form.style.position = 'absolute';
      form.style.top = '0px';
      form.style.left = '0px';
      form.style.display = 'none';
      form.target = id;
      form.method = 'POST';
      form.setAttribute('accept-charset', 'utf-8');
      area.name = 'd';
      form.appendChild(area);
      document.body.appendChild(form);

      this.form = form;
      this.area = area;
    }

    this.form.action = this.prepareUrl() + query;

    function complete () {
      initIframe();
      self.socket.setBuffer(false);
    };

    function initIframe () {
      if (self.iframe) {
        self.form.removeChild(self.iframe);
      }

      try {
        // ie6 dynamic iframes with target="" support (thanks Chris Lambacher)
        iframe = document.createElement('<iframe name="'+ self.iframeId +'">');
      } catch (e) {
        iframe = document.createElement('iframe');
        iframe.name = self.iframeId;
      }

      iframe.id = self.iframeId;

      self.form.appendChild(iframe);
      self.iframe = iframe;
    };

    initIframe();

    // we temporarily stringify until we figure out how to prevent
    // browsers from turning `\n` into `\r\n` in form inputs
    this.area.value = io.JSON.stringify(data);

    try {
      this.form.submit();
    } catch(e) {}

    if (this.iframe.attachEvent) {
      iframe.onreadystatechange = function () {
        if (self.iframe.readyState == 'complete') {
          complete();
        }
      };
    } else {
      this.iframe.onload = complete;
    }

    this.socket.setBuffer(true);
  };

  /**
   * Creates a new JSONP poll that can be used to listen
   * for messages from the Socket.IO server.
   *
   * @api private
   */

  JSONPPolling.prototype.get = function () {
    var self = this
      , script = document.createElement('script')
      , query = io.util.query(
             this.socket.options.query
          , 't='+ (+new Date) + '&i=' + this.index
        );

    if (this.script) {
      this.script.parentNode.removeChild(this.script);
      this.script = null;
    }

    script.async = true;
    script.src = this.prepareUrl() + query;
    script.onerror = function () {
      self.onClose();
    };

    var insertAt = document.getElementsByTagName('script')[0];
    insertAt.parentNode.insertBefore(script, insertAt);
    this.script = script;

    if (indicator) {
      setTimeout(function () {
        var iframe = document.createElement('iframe');
        document.body.appendChild(iframe);
        document.body.removeChild(iframe);
      }, 100);
    }
  };

  /**
   * Callback function for the incoming message stream from the Socket.IO server.
   *
   * @param {String} data The message
   * @api private
   */

  JSONPPolling.prototype._ = function (msg) {
    this.onData(msg);
    if (this.isOpen) {
      this.get();
    }
    return this;
  };

  /**
   * The indicator hack only works after onload
   *
   * @param {Socket} socket The socket instance that needs a transport
   * @param {Function} fn The callback
   * @api private
   */

  JSONPPolling.prototype.ready = function (socket, fn) {
    var self = this;
    if (!indicator) return fn.call(this);

    io.util.load(function () {
      fn.call(self);
    });
  };

  /**
   * Checks if browser supports this transport.
   *
   * @return {Boolean}
   * @api public
   */

  JSONPPolling.check = function () {
    return 'document' in global;
  };

  /**
   * Check if cross domain requests are supported
   *
   * @returns {Boolean}
   * @api public
   */

  JSONPPolling.xdomainCheck = function () {
    return true;
  };

  /**
   * Add the transport to your public io.transports array.
   *
   * @api private
   */

  io.transports.push('jsonp-polling');

})(
    'undefined' != typeof io ? io.Transport : module.exports
  , 'undefined' != typeof io ? io : module.parent.exports
  , this
);

if (typeof define === "function" && define.amd) {
  define([], function () { return io; });
}
})();
