// The other two services run on their own ports of the same machine.
const ERP_PORT = 3100;
const WAHA_PORT = 3200;
const serviceUrl = (port: number) => `${window.location.protocol}//${window.location.hostname}:${port}`;

export const ERP_URL = serviceUrl(ERP_PORT);
export const WAHA_URL = serviceUrl(WAHA_PORT);
