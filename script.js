const $$ = (selector) => {
    selector[0] === "#"
        ? document.querySelector(selector)
        : document.querySelectorAll(selector);
};

/* ------------------------ API URLs ------------------------ */
const HOST = "demo.signalk.org"; // "localhost:3443", "demo.signalk.org"
const SERVER = "https://" + HOST + "/signalk/v1/api/";
const SELF = SERVER + "vessels/self/";

/* ------------------ Dashboard Components ------------------ */
const GPS = () => ({
    meta: {
        title: "GPS",
        data: ["Num. of Satellites", "Latitude", "Longitude"],
        endpoint: SELF + "navigation/",
        show: true,
    },

    data: [0, 0.0, 0.0],

    async init() {
        this.data[0] = await UTILS.fetchText(
            this.meta.endpoint + "gnss/satellites/value/"
        );
        [this.data[1], this.data[2]] = Object.values(
            await UTILS.fetchJSON(this.meta.endpoint + "position/value/")
        );

        // refresh data every 3 seconds
        setTimeout(() => this.init(), 3000);
    },
});

const AIS = () => ({
    meta: {
        title: "AIS",
        data: ["Target MMSI", "Target Class", "Distance to Target (m)"],
        endpoint: SERVER + "vessels/",
        show: true,
    },

    data: ["", "", 0.0],

    async init() {
        const vessels = await UTILS.fetchJSON(this.meta.endpoint);

        // get { mmsi, class, distance } of nearest vessel
        [this.data[0], this.data[1], this.data[2]] = Object.values(
            UTILS.getNearestVessel(vessels)
        );

        // refresh data every 3 seconds
        setTimeout(() => this.init(), 3000);
    },
});

const DEPTH = () => ({
    meta: {
        title: "Depth",
        data: [
            "Below Transducer (m)",
            "Transducer to Keel (m)",
            "Below Keel (m)",
        ],
        endpoint: SELF + "environment/depth/",
        show: true,
    },

    data: [0.0, 0.0, 0.0],

    async init() {
        [this.data[0], this.data[1], this.data[2]] = await Promise.all([
            UTILS.fetchText(
                this.meta.endpoint + "belowTransducer/value/",
                UTILS.trim,
                [3]
            ),
            UTILS.fetchText(
                this.meta.endpoint + "transducerToKeel/value/",
                UTILS.trim,
                [3]
            ),
            UTILS.fetchText(
                this.meta.endpoint + "belowKeel/value/",
                UTILS.trim,
                [3]
            ),
        ]);

        // refresh data every 3 seconds
        setTimeout(() => this.init(), 3000);
    },
});

const WIND = () => ({
    meta: {
        title: "Wind",
        data: ["Apparent Speed (m/s)", "Angle from Port (rad)"],
        endpoint: SELF + "environment/wind/",
        show: true,
    },

    data: [0.0, 0.0],

    async init() {
        [this.data[0], this.data[1]] = await Promise.all([
            UTILS.fetchText(
                this.meta.endpoint + "speedApparent/value/",
                UTILS.trim,
                [3]
            ),
            UTILS.fetchText(
                this.meta.endpoint + "angleApparent/value/",
                UTILS.trim,
                [3]
            ),
        ]);

        // refresh data every 3 seconds
        setTimeout(() => this.init(), 3000);
    },
});

const AUDIO = () => ({
    meta: {
        title: "Audio",
        data: ["File", "Status"],
        endpoint: SELF + "audio/",
        show: true,
    },

    data: ["", ""],

    async init() {
        [this.data[0], this.data[1]] = await Promise.all([
            UTILS.fetchText(this.meta.endpoint + "file/"),
            UTILS.fetchText(this.meta.endpoint + "status/"),
        ]);

        // refresh data every 3 seconds
        setTimeout(() => this.init(), 3000);
    },
});

/* * /
const COMPONENTS = {
    gps: GPS(),
    ais: AIS(),
    depth: DEPTH(),
    wind: WIND(),
    audio: AUDIO(),
};
// */

/* -------------------- Utility Functions ------------------- */
const UTILS = {
    res(msg) {
        return msg.json();
    },
    err(msg) {
        console.log(msg);
        return null;
    },
    trim(num, dp = 8) {
        return num.substring(0, num.indexOf(".") + 1 + dp);
    },
    async fetchJSON(url, callback) {
        return await fetch(url)
            .then(this.res)
            .then(callback == null ? (data) => data : callback)
            .catch(this.err);
    },
    async fetchText(url, callback, callbackArgs) {
        const res = await this.fetchJSON(url, (res) => JSON.stringify(res));
        return callback == null
            ? res
            : callbackArgs == null
            ? callback(res)
            : callback(res, ...callbackArgs);
    },
    getVesselDistance(p1, p2) {
        /** haversine formula
         *
         * source: http://www.movable-type.co.uk/scripts/latlong.html
         */
        const R = 6371e3; // Earth's mean radius in metres

        // y: latitude, x: longitude (in radians)
        const y1 = (p1.latitude * Math.PI) / 180;
        const y2 = (p2.latitude * Math.PI) / 180;
        const yDelta = ((p2.latitude - p1.latitude) * Math.PI) / 180;
        const xDelta = ((p2.longitude - p1.longitude) * Math.PI) / 180;

        const a =
            Math.sin(yDelta / 2) * Math.sin(yDelta / 2) +
            Math.cos(y1) *
                Math.cos(y2) *
                Math.sin(xDelta / 2) *
                Math.sin(xDelta / 2);
        const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

        return (R * c).toFixed(3); // distance between coordinates in metres
    },
    getNearestVessel(vessels) {
        let ownPos = {};
        let distances = {};
        let nearestVessel = { mmsi: "", vesselClass: "", distance: 0.0 };

        // get distance from self to global origin
        Object.entries(vessels).forEach((vessel) => {
            let [name, data] = vessel;
            if (
                name.startsWith("urn:mrn:signalk:uuid:") &&
                data.navigation.position != null
            ) {
                ownPos = data.navigation.position.value;
                return;
            }
        });

        // get distance from self to nearby vessels
        Object.entries(vessels).forEach((vessel) => {
            let [name, data] = vessel;
            if (
                !name.startsWith("urn:mrn:signalk:uuid:") &&
                data.navigation.position != null
            ) {
                distances[name] = this.getVesselDistance(
                    ownPos,
                    data.navigation.position.value
                );
            }
        });

        // find nearest vessel info
        nearestVessel.distance = Math.min(...Object.values(distances));
        Object.entries(distances).forEach((vessel) => {
            let [name, distance] = vessel;
            if (distance === nearestVessel.distance.toString()) {
                nearestVessel.mmsi = name.split(":")[4];
            }
        });

        // get vessel class
        const ID = "urn:mrn:imo:mmsi:" + nearestVessel.mmsi;
        if (vessels[ID] != null) {
            nearestVessel.vesselClass = vessels[ID].sensors.ais.class.value;
        }

        return nearestVessel;
    },
};
