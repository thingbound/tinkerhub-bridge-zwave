'use strict';

const th = require('tinkerhub');

const { Thing, State, Children } = require('abstract-things');
const MachineDetails = require('tinkerhub/machine-details');
const storageApi = require('abstract-things/storage/api');
const storage = storageApi.global();

const OZW = require('openzwave-shared');
const ZWaveDevice = require('./lib/device');

const path = require('path');

const dataPath = path.join(storageApi.dataDir, 'openzwave');
const fs = require('fs');
if(! fs.existsSync(dataPath)) {
    fs.mkdirSync(dataPath);
}

// SIGINT handler if called directly
if(! module.parent) {
	process.on('SIGINT', function() { process.exit() });
}

class ZwaveController extends Thing.with(MachineDetails, State, Children) {
	static get type() {
		return 'zwave:bridge';
	}

	static availableAPI(builder) {
		builder.action('connect')
			.description('Connect to a Z-wave network using the given USB-port')
			.argument('string', false, 'USB-port such as /dev/ttyUSB0 or /dev/ttyACM0')
			.done();

		builder.action('addDevice')
			.done();

		builder.action('removeDevice')
			.done();
	}

	constructor() {
		super();

		// FIXME: The identifier should be unique even if several instances are running
		this.id = 'zwave:bridge';
		this.metadata.name = 'Zwave Controller';

		this.updateState('configured', false);
		this.updateState('connected', false);

		this.nodes = {};

		const zwave = this.zwave = new OZW({
			Logging: this.debug.enabled,
			ConsoleOutput: false,
			UserPath: dataPath,
			SaveConfiguration: true
		});

		// Store configuration every hour
		setInterval(() => {
			if(this.getState('connected')) {
				zwave.writeConfig();
			}
		}, 60 * 60 * 1000);

		/*
		 * When the driver becomes ready the controller is connected and the
		 * connection promise should resolve.
		 */
		zwave.on('driver ready', id => {
			this.updateState('connected', true);
			this.updateState('networkId', id);
			this.debug('Driver connected');

			if(this.connectPromise) {
				this.connectPromise.resolve(true);
				this.connectPromise = null;
			}
		});

		/*
		 * Driver failed to connect, make sure to update state and resolve
		 * connection promise if present.
		 */
		zwave.on('driver failed', () => {
			this.updateState('connected', false);

			this.debug('Driver failed');
			if(this.connectPromise) {
				this.connectPromise.reject(new Error('Failed to start driver'));
				this.connectPromise = null;
			}

			zwave.disconnect(this.currentPort);
		});

		/*
		 * The entire network has been scanned. Nothing special is done here
		 * as the nodes should already have been created.
		 */
		zwave.on('scan complete', () => {
			this.debug('Scan complete found', Object.keys(this.nodes));
		});

		zwave.on('node added', id => {
			this.debug('Node ' + id + ' added');
			const current = this.nodes[id];
			if(current && current.thing) {
				/*
				 * We have a device already registered, remove the old device before
				 * adding a new one.
				 */
				this.removeChild(current.thing);
			}

			this.nodes[id] = {
				id: id,
				ready: false,

				metadata: {},
				classes: {},
			};
		});

		zwave.on('node available', (id, info) => {
			this.debug('Node', id, 'available info=', info);
		});

		zwave.on('node ready', (id, info) => {
			// A node in the network is ready for use, register it with Tinkerhub
			this.debug('Node', id, 'ready info=', info);
			const node = this.nodes[id];

			node.metadata = info;
			node.ready = true;

			node.thing = new ZWaveDevice(this.state.networkId, zwave, node);
			this.addChild(node.thing);
		});

		zwave.on('node event', (id, data) => {
			this.debug('Received event for node ' + id, data);

			const node = this.nodes[id];
			if(node.thing) {
				node.thing._event(data);
			}
		})

		zwave.on('value added', (nodeId, comClass, valueId)  => {
			const node = this.nodes[nodeId];

			this.debug('Value added', nodeId, 'class=', comClass, 'value=', valueId);

			let comClassObj = node.classes[comClass];
			if(! comClassObj) {
				comClassObj = node.classes[comClass] = {};
			}

			let instanceObj = comClassObj[valueId.instance];
			if(! instanceObj) {
				instanceObj = comClassObj[valueId.instance] = {};
			}

			instanceObj[valueId.index] = {
				value: valueId.value,
				name: valueId.label,
				type: valueId.type,
				details: {
					unit: valueId.units || null,
					min: valueId.min,
					max: valueId.max,
					help: valueId.help
				}
			};

			if(node.thing) {
				node.thing._valueChanged(comClass, valueId.instance, valueId.index, null, valueId.value);
			}
		});

		zwave.on('value changed', (nodeId, comClass, valueId) => {

			const node = this.nodes[nodeId];
			const comClassObj = node.classes[comClass];
			const instance = comClassObj[valueId.instance];

			const current = instance[valueId.index];
			const oldValue = current.value;

			this.debug('Value changed', nodeId, 'class=', comClass, 'valueId=', valueId);

			current.value = valueId.value;
			if(node.thing) {
				node.thing._valueChanged(comClass, valueId.instance, valueId.index, oldValue, valueId.value);
			}
		});

		zwave.on('value refreshed', (nodeId, comClass, valueId) => {
			const node = this.nodes[nodeId];
			if(node.ready) {
				this.debug('Value refreshed', nodeId, 'class=', comClass, 'value=', valueId);
			}
		});

		zwave.on('value removed', (nodeId, comClass, instance, index) => {
			const node = this.nodes[nodeId];
			this.debug('Value removed', nodeId, comClass, instance, index);

			const current = node.classes[comClass][instance][index];
			delete node.classes[comClass][instance][index];
			if(node.thing) {
				node.thing._valueChanged(comClass, index, current.value, null);
			}
		});

		zwave.on('scene event', (nodeId, sceneId) => {
			const node = this.nodes[nodeId];
			this.debug('Scene event', nodeId, 'scene=', sceneId);
			if(node.thing) {
				node.thing._scene(sceneId);
			}
		});

	}

	init() {
		return super.init()
			.then(() => {
				return storage.get('zwave:controller')
					.then(config => {
						// Set a default
						config = config || {};

						// Store the config and try to connect
						this.config = config;
						this.updateState('configured', !! config.port);
						this.updateState('port', config.port || null);
						this.tryConnect();
					});
			})
			.then(() => this);
	}

	destroy() {
		super.destroy();
	}

	tryConnect() {
		if(this.connectPromise) return this.connectPromise;

		if(this.currentPort == this.config.port && this.getState('connected')) {
			// No port change and we are connected
			return this.state;
		}

		if(this.currentPort) {
			// Already connected, disconnect us
			this.zwave.disconnect(this.currentPort);
			this.updateState('connected', false);
			this.currentPort = null;
		}

		if(! this.config.port) {
			// If we have no port just return the state
			return false;
		}

		this.debug('Connecting to ' + this.config.port);

		this.currentPort = this.config.port;
		this.zwave.connect(this.config.port);

		let connectPromise = {};
		return new Promise(function(resolve, reject) {
			connectPromise.resolve = resolve;
			connectPromise.reject = reject;
		});
	}

	connect(port) {
		const changedPort = this.config.port != port;
		if(! changedPort) {
			return this.state;
		}

		this.config.port = port;

		return storage.set('zwave:controller', this.config)
			.then(() => {
				this.updateState('configured', !! port);
				return this.tryConnect();
			});
    }

    addDevice(secure) {
        if(! this.state.connected) throw new Error('ZWave network not connected');

        this.zwave.addNode(secure || false);
        return 'Press inclusion/action button on device to pair';
    }

    removeDevice() {
        if(! this.state.connected) throw new Error('ZWave network not connected');
        this.zwave.removeNode();
        return 'Press inclusion/action button on device to remove';
    }
}

new ZwaveController().init()
	.then(thing => th.register(thing))
	.catch(err => console.log(err));
