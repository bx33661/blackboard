const knownTypes = { txt: 'text/plain', js: 'application/javascript', html: 'text/html' };

export class Response {
  constructor() { this.headers = {}; }
  set(name, value) { this.headers[name.toLowerCase()] = value; }
  attachment(filename) {
    this.set('Content-Disposition', 'attachment; filename=' + encodeURIComponent(filename));
    const extension = filename.split('.').at(-1).toLowerCase();
    this.set('Content-Type', knownTypes[extension] || 'application/octet-stream');
  }
  send(body) { return { headers: this.headers, body }; }
}
