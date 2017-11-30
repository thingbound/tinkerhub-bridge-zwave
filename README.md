# Z-wave Device Bridge for Tinkerhub

This module provides support for creating a Z-wave network using  
[openzwave-shared](https://github.com/OpenZWave/node-openzwave-shared) and
bringing those devices into Tinkerhub.

As this module only exposes generic Z-wave devices you probably want to
combine it with other modules that expose user friendly interfaces to the
Z-wave devices.

* **Latest version**: 0.1.0
* **Status**: Unstable

## Installation and setup

You will need to install OpenZWave, see [Prerequisites in the openzwave-shared README](https://github.com/OpenZWave/node-openzwave-shared#prerequisites)
and [a compatible controller](https://github.com/OpenZWave/open-zwave/wiki/Controller-Compatibility-List).

When running [tinkerhubd](https://github.com/tinkerhub/tinkerhub-daemon) install
via:

```
$ tinkerhubd install bridge-zwave
```

This will make the bridge available for configuration, the type of the bridge
device is `zwave:bridge`. The easiest way to configure it is by using the CLI:

```
$ tinkerhub
> type:zwave:bridge connect /dev/ttyACM0
 SUCCESS zwave:bridge:ix77x0i92jyi
  configured: true
  connected: true
```

Make sure that Node has read and write permissions to your USB-device.

## Adding Z-wave devices

Call `addDevice` on the bridge add a device.

```
$ tinkerhub
> type:zwave:bridge addDevice
 SUCCESS zigbee:bridge:ix77x0i92jyi
  Press inclusion/action button on device to pair
```

As soon as the bridge sees the device it will be made available as a new
device of type `zwave`.

## Extending devices

This module provides simple access to the Z-wave protocol and devices need to
be extended to do something useful.

```javascript
th.get('type:zwave')
  .extendWith(thing => thing.zwaveInspect()
    .then(data => {
      // Check for required Z-wave classes here
      if(! dataHasNeededClasses) return;

      return new CustomDevice(thing).init();
    })
  );
```

## Actions and events

### Action: `zwaveInspect`

Inspect the device, returning information about it and its classes. This is
useful for figuring out if a device should be enhanced and for manually
inspecting the data structure when building device extensions.

### Action: `zwaveValues(classId, [instance])`

Fetch all values for the given class optionally limiting them to a specific
instance.

### Action: `zwaveGetValue(classId, instance, index)`

Read a single value in the given class and instance.

### Action: `zwaveGetValues(values)`

Read several values at once. `values` is an array with object such as:

```
{
	classId: 30,
	instance: 1,
	index: 0
}
```

### Action: `zwaveSetValue(classId, instance, index, value)`

Set a value for the given class and instance.

### Event: `zwave:value`

Emitted when a value on the device is reported to have changed. Data is an
object with the following keys:

* `classId`
* `instance`
* `index`
* `oldValue`
* `newValue`

### Event: `zwave:event`

Emitted when the Z-wave device reports an event. Data is specific to the device
emitting the event.
