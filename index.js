'use strict';

const noble = require('noble');
const allowDuplicate = false;
const allowServiceUUIDs = ['b3b3690150d34044808d50835b13a6cd'];
const peripheralAddressToFind = null;
const peripheralNamePatternToFind = /^Pochiru/;
const serviceUuidToFind = 'b3b3690150d34044808d50835b13a6cd';
const charasteristicUuidToFind = 'b3b3910250d34044808d50835b13a6cd';

// const debug = {
// 	log: ()=>null,
// 	dir: ()=>null
// };
const debug = console;

function discoverDescriptors(characteristic) {
	if (!(charasteristicUuidToFind && characteristic.uuid != charasteristicUuidToFind) && characteristic.properties[0].match(/^(notify|indicate)$/)) {
		characteristic.notify(true, (error)=>{
			console.log('[notify on]');
		});
		characteristic.on('data', (data, isNotification)=>{
			console.log('[on data]', isNotification)
			console.dir(data);
		});
	}
	return new Promise((resolve)=>{
		characteristic.discoverDescriptors((error, descriptors)=>{
			resolve({
				uuid: characteristic.uuid,
				name: characteristic.name,
				type: characteristic.type,
				properties: characteristic.properties,
				descriptors: descriptors.map((descriptor)=>({
					uuid: descriptor.uuid,
					name: descriptor.name,
					type: descriptor.type
				}))
			});
		});
	});
}

function discoverCharacteristics(service) {
	return new Promise((resolve)=>{
		if (serviceUuidToFind && service.uuid != serviceUuidToFind) return;
		service.on('includedServicesDiscover', function(includedServiceUuids) {
			debug.log('[includedServicesDiscover]');
			debug.dir(includedServiceUuids);
			this.discoverCharacteristics();
		});
		service.on('characteristicsDiscover', (characteristics)=>{
			let tasks = characteristics.map((characteristic) => discoverDescriptors(characteristic));
			Promise.all(tasks).then((characteristics)=>resolve({
				uuid: service.uuid,
				name: service.name,
				type: service.type,
				characteristics: characteristics
			}));
		});
		service.discoverIncludedServices();
	});
}

function discoverServices(peripheral) {
	return new Promise((resolve)=>{
		peripheral.on('connect', function(){
			debug.log('[connect]');
			this.discoverServices();
		});
		peripheral.on('disconnect', ()=>{
			debug.log('[disconnect]');
		});
		peripheral.on('servicesDiscover', (services)=>{
			let tasks = services.map((service) => discoverCharacteristics(service));
			Promise.all(tasks).then(resolve);
		});
		peripheral.connect();
	});
}

noble.on('stateChange', (state)=>{
	debug.log('[stateChange]');
	if (state=='poweredOn') {
		noble.startScanning(allowServiceUUIDs, allowDuplicate, (error)=>{
			if (error) {
				debug.log('[error]');
				debug.dir(error);
			}
		});
	}
	else {
		noble.stopScanning();
	}
});

noble.on('scanStart', ()=>{
	debug.log('[scanStart]');
});

noble.on('scanStop', ()=>{
	debug.log('[scanStop]');
});

let foundAddresses = {};

noble.on('discover', (peripheral)=>{
	if (peripheralAddressToFind && peripheral.address != peripheralAddressToFind) return;
	if (!(peripheral.advertisement.localName||'').match(peripheralNamePatternToFind)) return;
	if (foundAddresses[peripheral.address]) return;
	foundAddresses[peripheral.address] = true;

	debug.log('[discover] ' + (peripheral.advertisement.localName || peripheral.address));

	debug.log('  BT Address: ' + peripheral.address + ' (Type:' + peripheral.addressType + ')');
	let data = peripheral.advertisement.manufacturerData;
	if (data) {
		let dataCompany = data.readUInt16LE(0);
		let dataType = data.readUInt8(2);
		debug.log('  Data Company: 0x' + dataCompany.toString(16));
		debug.log('  Data Type: 0x' + dataType.toString(16));
		debug.log('  Data: ' + data.slice(3).toString('hex').replace(/\S\S/g, function(m){ return m+' '; }));
	}

	noble.stopScanning();
	discoverServices(peripheral)
		.then((services)=>{
			for (let service of services) {
				debug.log(`Service: ${service.uuid} ${service.type} ${service.name}`);
				for (let characteristic of service.characteristics) {
					debug.log(`    Chara.: ${characteristic.uuid} ${characteristic.type} ${characteristic.name} ${JSON.stringify(characteristic.properties)}`);
					for (let descriptor of characteristic.descriptors) {
						debug.log(`        Desc.: ${descriptor.uuid} ${descriptor.type} ${descriptor.name}`);
					}
				}
			}
			debug.log('END');
		});
});

