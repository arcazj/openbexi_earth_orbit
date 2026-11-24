import { Matrix4, Quaternion, Vector3 } from 'three';

// Return a rigid frame in spacecraft-local metres. The GLBs encode port
// dimensions in mesh scales, which must never scale the attached spacecraft.
function interfaceFrame(root, name, face) {
    const port = name && root.getObjectByName(name);
    if (!port) return null;
    port.updateWorldMatrix(true, false);
    const transform = root.matrixWorld.clone().invert().multiply(port.matrixWorld);
    const center = new Vector3();
    if (port.geometry) {
        port.geometry.computeBoundingBox();
        const bounds = port.geometry.boundingBox;
        bounds.getCenter(center);
        center.z = bounds[face].z;
    }
    center.applyMatrix4(transform);
    const orientation = new Quaternion().setFromRotationMatrix(new Matrix4().extractRotation(transform));
    return new Matrix4().compose(center, orientation, new Vector3(1,1,1));
}

export function mountAttachment(selected, guest, record, selectedKey) {
    const hostSelected = selectedKey === record.host.key;
    const host = hostSelected ? selected : guest;
    const vehicle = hostSelected ? guest : selected;
    const target = interfaceFrame(host, record.hostInterface, 'min');
    const source = interfaceFrame(vehicle, record.vehicleInterface, 'max');
    if (!target || !source) return false;
    const hostFromVehicle = target.multiply(new Matrix4().makeRotationZ(record.roll || 0)).multiply(source.invert());
    const relation = hostSelected ? hostFromVehicle : hostFromVehicle.invert();
    guest.getObjectByName('OpenBEXIPreview')?.removeFromParent();
    relation.decompose(guest.position, guest.quaternion, guest.scale);
    selected.add(guest);
    guest.updateMatrixWorld(true);
    return true;
}
