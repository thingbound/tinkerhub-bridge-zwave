'use strict';

const { Thing, Nameable } = require('abstract-things');

const classes = {
    0x20: 'Basic',
    0x21: 'Controller Replication',
    0x22: 'Application Status',
    0x23: 'Z/IP Services',
    0x24: 'Z/IP Server',
    0x25: 'Switch Binary',
    0x26: 'Switch Multilevel',
    0x27: 'Switch All',
    0x28: 'Switch Toggle Binary',
    0x29: 'Switch Toggle Multilevel',
    0x2A: 'Chimney Fan',
    0x2B: 'Scene Activation',
    0x2C: 'Scene Actuator Configuration',
    0x2D: 'Scene Controller Configuration',
    0x2E: 'Z/IP Client',
    0x2F: 'Z/IP Advanced Services',
    0x30: 'Sensor Binary',
    0x31: 'Sensor Multilevel',
    0x32: 'Meter',
    0x33: 'Z/IP Advanced Server',
    0x34: 'Z/IP Advanced Client',
    0x35: 'Meter Pulse',
    0x3C: 'Meter Table Config',
    0x3D: 'Meter Table Monitor',
    0x3E: 'Meter Table Push',
    0x38: 'Thermostat Heating',
    0x40: 'Thermostat Mode',
    0x42: 'Thermostat Operating State',
    0x43: 'Thermostat Setpoint',
    0x44: 'Thermostat Fan Mode',
    0x45: 'Thermostat Fan State',
    0x46: 'Climate Control Schedule',
    0x47: 'Thermostat Setback',
    0x4c: 'Door Lock Logging',
    0x4e: 'Schedule Entry Lock',
    0x50: 'Basic Window Covering',
    0x51: 'MTP Window Covering',
    0x59: 'Association Group Info',
    0x5a: 'Device Reset Locally',
    0x5b: 'Central Scene',
    0x5c: 'IP Association',
    0x5d: 'Antitheft',
    0x5e: 'ZWave+ Info',
    0x60: 'Multi Channel V2 / Multi Instance',
    0x62: 'Door Lock',
    0x63: 'User Code',
    0x66: 'Barrier Operator',
    0x70: 'Configuration',
    0x71: 'Alarm',
    0x72: 'Manufacturer Specific',
    0x73: 'Powerlevel',
    0x75: 'Protection',
    0x76: 'Lock',
    0x77: 'Node Naming',
    0x7a: 'Firmware Update Metadata',
    0x7b: 'Grouping Name',
    0x7c: 'Remote Association Activate',
    0x7d: 'Remote Association',
    0x80: 'Battery',
    0x81: 'Clock',
    0x82: 'Hail',
    0x84: 'Wake Up',
    0x85: 'Association',
    0x86: 'Version',
    0x87: 'Indicator',
    0x88: 'Proprietary',
    0x89: 'Language',
    0x8a: 'Time',
    0x8b: 'Time Parameters',
    0x8c: 'Geographic Location',
    0x8d: 'Composite',
    0x8e: 'Multi Channel Association',
    0x8f: 'Multi Command',
    0x90: 'Energy Production',
    0x91: 'Manufacturer Proprietary',
    0x92: 'Screen Metadata',
    0x93: 'Screen Attributes',
    0x94: 'Simple A/V Control',
    0x95: 'A/V Content Directory Metadata',
    0x96: 'A/V Renderer Status',
    0x97: 'A/V Content Search Metadata',
    0x98: 'Security',
    0x99: 'A/V Tagging Metadata',
    0x9a: 'IP Configuraiton',
    0x9b: 'Association Command Configuration',
    0x9c: 'Sensor Alarm',
    0x9d: 'Silence Alarm',
    0x9e: 'Sensor Configuration',
    0xef: 'Mark'
};

class ZWaveDevice extends Thing.with(Nameable) {

	static get type() {
		return 'zwave';
	}

	static availableAPI(builder) {
		builder.action('zwaveInspect')
			.done();

		builder.action('zwaveClasses')
			.done();

		builder.action('zwaveValues')
			.done();

		builder.action('zwaveGetValue')
			.done();

		builder.action('zwaveGetValues')
			.done()

		builder.action('zwaveSetValue')
			.done();

		builder.action('zwaveEnablePoll')
			.done();

		builder.action('zwaveDisablePoll')
			.done();
	}

    constructor(netId, zwave, node) {
		super();

		// Set the identifier of this node
		this.id = 'zwave:' + netId + ':' + node.id;

        this._node = node;
        this._zwave = zwave;

		this.metadata.name = node.metadata.name || (node.metadata.product + ' (' + node.metadata.type + ')');
	}

	changeName(name) {
		this._zwave.setNodeName(this._node.id, name);
		this.metadata.name = name;
	}

    _valueChanged(comClass, instance, index, oldValue, newValue) {
        this.emitEvent('zwave:value', {
            comClass: comClass,
            instance: instance,
            index: index,
            oldValue: oldValue,
            newValue: newValue
        });
    }

    _event(data) {
        this.emitEvent('zwave:event', {
            data: data
        });
    }

    _scene(id) {
        this.emitEvent('zwave:scene', {
            id: id
        });
    }

    zwaveClasses() {
        const result = {};
        Object.keys(this._node.classes).forEach(key => {
            const label = classes[key];
            result[key] = label ? label : 'Unknown Class'
        });
        return result;
    }

    zwaveInspect() {
        return {
            metadata: this._node.metadata,
            classes: this._node.classes
        };
    }

    zwaveValues(classId, instance) {
        const instances = this._node.classes[classId];
        if(! instances) throw new Error('Unsupported class');

        if(typeof instance === 'number') {
            const values = instances[instance];
            return values;
        }

        return instances;
    }

    zwaveGetValue(classId, instance, index) {
        const instances = this._node.classes[classId];
        if(! instances) throw new Error('Unsupported class');

        const instanceObj = instances[instance];
        if(! instanceObj) return null;

        const idx = instanceObj[index];
        if(! idx) return null;
        return idx.value;
    }

    zwaveGetValues(values) {
        return values.map(def => {
            const instances = this._node.classes[def.classId];
            if(! instances) throw new Error('Unsupported class');

            const instanceObj = instances[def.instance];
            if(! instanceObj) return null;

            const idx = instanceObj[def.index];
            if(! idx) return null;
            return idx.value;
        });
    }

    zwaveSetValue(classId, instance, index, value) {
        this._zwave.setValue(this._node.id, classId, instance, index, value);
    }

    zwaveEnablePoll(classId) {
        this._zwave.enablePoll(this._node.id, classId);
    }

    zwaveDisablePoll(classId) {
        this._zwave.disablePoll(this._node.id, classId);
    }
}

module.exports = ZWaveDevice;
