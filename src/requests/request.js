import Promise from '../utils/promise';
import { HttpMethod } from '../enums';
import { Device } from '../device';
import { RequestProperties } from './properties';
import { NoResponseError } from '../errors';
import { KinveyRack } from '../rack/rack';
import { Response } from './response';
import { byteCount } from '../utils/string';
import qs from 'qs';
import appendQuery from 'append-query';
import assign from 'lodash/assign';
import result from 'lodash/result';
import forEach from 'lodash/forEach';
import isString from 'lodash/isString';
import isPlainObject from 'lodash/isPlainObject';
import isEmpty from 'lodash/isEmpty';

/**
 * @private
 */
export class Request {
  constructor(options = {}) {
    options = assign({
      method: HttpMethod.GET,
      headers: {},
      url: null,
      data: null,
      timeout: process.env.KINVEY_DEFAULT_TIMEOUT || 10000,
      followRedirect: true
    }, options);

    this.method = options.method;
    this.url = options.url;
    this.data = options.data || options.body;
    this.timeout = options.timeout;
    this.followRedirect = options.followRedirect;
    this.executing = false;

    const headers = options.headers && isPlainObject(options.headers) ? options.headers : {};

    if (!headers.Accept || !headers.accept) {
      headers.Accept = 'application/json; charset=utf-8';
    }

    this.addHeaders(headers);
  }

  get method() {
    return this._method;
  }

  set method(method) {
    if (!isString(method)) {
      method = String(method);
    }

    method = method.toUpperCase();

    switch (method) {
      case HttpMethod.GET:
      case HttpMethod.POST:
      case HttpMethod.PATCH:
      case HttpMethod.PUT:
      case HttpMethod.DELETE:
        this._method = method;
        break;
      default:
        throw new Error('Invalid Http Method. Only GET, POST, PATCH, PUT, and DELETE are allowed.');
    }
  }

  get url() {
    return this._url;
  }

  set url(url) {
    this._url = url;
  }

  get body() {
    return this.data;
  }

  set body(body) {
    this.data = body;
  }

  get data() {
    return this._data;
  }

  set data(data) {
    if (data) {
      const contentTypeHeader = this.getHeader('Content-Type');
      if (!contentTypeHeader) {
        this.setHeader('Content-Type', 'application/json; charset=utf-8');
      }
    } else {
      this.removeHeader('Content-Type');
    }

    this._data = data;
  }

  getHeader(name) {
    if (name) {
      if (!isString(name)) {
        name = String(name);
      }

      const headers = this.headers || {};
      const keys = Object.keys(headers);

      for (let i = 0, len = keys.length; i < len; i++) {
        const key = keys[i];

        if (key.toLowerCase() === name.toLowerCase()) {
          return headers[key];
        }
      }
    }

    return undefined;
  }

  setHeader(name, value) {
    if (!name || !value) {
      throw new Error('A name and value must be provided to set a header.');
    }

    if (!isString(name)) {
      name = String(name);
    }

    const headers = this.headers || {};

    if (!isString(value)) {
      headers[name] = JSON.stringify(value);
    } else {
      headers[name] = value;
    }

    this.headers = headers;
  }

  addHeaders(headers) {
    if (!isPlainObject(headers)) {
      throw new Error('Headers argument must be an object.');
    }

    const names = Object.keys(headers);

    forEach(names, name => {
      const value = headers[name];
      this.setHeader(name, value);
    });
  }

  removeHeader(name) {
    if (name) {
      if (!isString(name)) {
        name = String(name);
      }

      const headers = this.headers || {};
      delete headers[name];
      this.headers = headers;
    }
  }

  clearHeaders() {
    this.headers = {};
  }

  isExecuting() {
    return this.executing ? true : false;
  }

  execute() {
    if (this.executing) {
      return Promise.reject(new Error('Unable to execute the request. The request is already executing.'));
    }

    this.executing = Promise.resolve().then(response => {
      this.executing = false;
      return response;
    }).catch(err => {
      this.executing = false;
      throw err;
    });

    return this.executing;
  }

  toJSON() {
    const json = {
      method: this.method,
      headers: this.headers,
      url: this.url,
      data: this.data,
      followRedirect: this.followRedirect
    };

    return json;
  }
}

/**
 * @private
 */
export class KinveyRequest extends Request {
  constructor(options = {}) {
    super(options);

    options = assign({
      properties: null,
      auth: null,
      query: null
    }, options);

    this.rack = new KinveyRack();
    this.properties = options.properties;
    this.auth = options.auth;
    this.query = result(options.query, 'toJSON', options.query);

    const headers = {};
    headers['X-Kinvey-Api-Version'] = process.env.KINVEY_API_VERSION || 3;

    const device = new Device();
    headers['X-Kinvey-Device-Information'] = JSON.stringify(device.toJSON());

    if (options.contentType) {
      headers['X-Kinvey-Content-Type'] = options.contentType;
    }

    if (options.skipBL === true) {
      headers['X-Kinvey-Skip-Business-Logic'] = true;
    }

    if (options.trace === true) {
      headers['X-Kinvey-Include-Headers-In-Response'] = 'X-Kinvey-Request-Id';
      headers['X-Kinvey-ResponseWrapper'] = true;
    }

    this.addHeaders(headers);
  }

  set authHandler(authHandler) {
    this.authHandler = authHandler;
  }

  set properties(properties) {
    if (properties) {
      if (!(properties instanceof RequestProperties)) {
        properties = new RequestProperties(result(properties, 'toJSON', properties));
      }

      const appVersion = properties.appVersion;

      if (appVersion) {
        this.setHeader('X-Kinvey-Client-App-Version', appVersion);
      } else {
        this.removeHeader('X-Kinvey-Client-App-Version');
      }

      const customProperties = result(properties, 'toJSON', {});
      delete customProperties.appVersion;
      const customPropertiesHeader = JSON.stringify(customProperties);
      const customPropertiesByteCount = byteCount(customPropertiesHeader);
      const customPropertiesMaxBytesAllowed = process.env.KINVEY_MAX_HEADER_BYTES || 2000;

      if (customPropertiesByteCount >= customPropertiesMaxBytesAllowed) {
        throw new Error(
          `The custom properties are ${customPropertiesByteCount} bytes.` +
          `It must be less then ${customPropertiesMaxBytesAllowed} bytes.`,
          'Please remove some custom properties.');
      }

      this.setHeader('X-Kinvey-Custom-Request-Properties', customPropertiesHeader);
    }
  }

  get url() {
    const url = super.url;
    const queryString = {};

    if (this.query) {
      queryString.query = this.query.filter;

      if (!isEmpty(this.query.fields)) {
        queryString.fields = this.query.fields.join(',');
      }

      if (this.query.limit) {
        queryString.limit = this.query.limit;
      }

      if (this.query.skip > 0) {
        queryString.skip = this.query.skip;
      }

      if (!isEmpty(this.query.sort)) {
        queryString.sort = this.query.sort;
      }
    }

    for (const key in queryString) {
      if (queryString.hasOwnProperty(key)) {
        queryString[key] = isString(queryString[key]) ? queryString[key] : JSON.stringify(queryString[key]);
      }
    }

    return appendQuery(url, qs.stringify(queryString));
  }

  set url(url) {
    super.url = url;
  }

  execute() {
    const promise = super.execute().then(() => {
      return this.rack.execute(this);
    }).then(response => {
      if (!response) {
        throw new NoResponseError();
      }

      if (!(response instanceof Response)) {
        return new Response({
          statusCode: response.statusCode,
          headers: response.headers,
          data: response.data
        });
      }

      return response;
    }).then(response => {
      if (!response.isSuccess()) {
        throw response.error;
      }

      return response;
    });

    return promise;
  }

  cancel() {
    this.rack.cancel();
  }

  toJSON() {
    const json = super.toJSON();
    json.query = this.query;
    return json;
  }
}
