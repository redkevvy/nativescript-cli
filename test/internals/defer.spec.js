/**
 * Copyright 2014 Kinvey, Inc.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *    http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

/* global require: true */

// Obtain a reference to the top-level describe method.
var globalDescribe = describe;

/**
 * Test suite for `Kinvey.Defer` adapters.
 */
describe('Kinvey.Defer', function() {

  // If there is no adapter, skip the test suite.
  var describe = (function() {
    try {
      Kinvey.Defer.deferred();
      return globalDescribe;
    }
    catch(e) {
      return globalDescribe.skip;
    }
  }());

  // Kinvey.Defer.all.
  describe('the all method', function() {
    // Test suite.
    it('should throw on invalid arguments: promises.', function() {
      expect(function() {
        Kinvey.Defer.all();
      }).to.Throw('Array');
    });
    it('should resolve immediately given no promises.', function() {
      return expect(Kinvey.Defer.all([])).to.be.fulfilled;
    });
    it('should resolve given a fulfilled promise.', function() {
      var value   = this.randomID();
      var promise = Kinvey.Defer.resolve(value);
      return expect(Kinvey.Defer.all([ promise ])).to.become([ value ]);
    });
    it('should resolve given a pending promise.', function() {
      var value    = this.randomID();
      var deferred = Kinvey.Defer.deferred();

      var promise = Kinvey.Defer.all([deferred.promise]);
      deferred.resolve(value);

      return expect(promise).to.become([ value ]);
    });
    it('should resolve given a pending and fulfilled promise.', function() {
      var value1   = this.randomID();
      var value2   = this.randomID();
      var promise1 = Kinvey.Defer.resolve(value1);
      var deferred = Kinvey.Defer.deferred();

      var promise = Kinvey.Defer.all([ promise1, deferred.promise ]);
      deferred.resolve(value2);

      return expect(promise).to.become([ value1, value2 ]);
    });
    it('should reject given a rejected promise.', function() {
      var promise = Kinvey.Defer.reject(this.randomID());
      return expect(Kinvey.Defer.all([ promise ])).to.be.rejected;
    });
    it('should reject immediately if one promise gets rejected.', function() {
      var promise1 = Kinvey.Defer.resolve(this.randomID());
      var deferred = Kinvey.Defer.deferred();

      var promise = Kinvey.Defer.all([ promise1, deferred.promise ]);
      deferred.reject(this.randomID());

      return expect(promise).to.be.rejected;
    });
  });

  // Run Promises/A+ test suite (server only).
  // https://github.com/promises-aplus/promises-tests
  if('undefined' !== typeof module && 'undefined' !== typeof require) {// Node.js.
    describe('Promises/A+ Tests', function () {
      require('promises-aplus-tests').mocha({
        // Normalize adapter.
        // https://github.com/RubenVerborgh/promiscuous/blob/master/test/adapter.js
        resolved : Kinvey.Defer.resolve,
        rejected : Kinvey.Defer.reject,
        deferred : Kinvey.Defer.deferred
      });
    });
  }

});