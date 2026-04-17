/**
 * wallet.js — Lucky 7 Shared Wallet Bridge
 * Include AFTER firebase-app-compat + firebase-firestore-compat scripts.
 * 
 * Provides:
 *   L7Wallet.init()          — call once on page load; reads balance from Firestore
 *   L7Wallet.getBalance()    — returns current in-memory balance (Number)
 *   L7Wallet.deduct(amount)  — subtract locally (optimistic) + write to Firestore
 *   L7Wallet.credit(amount)  — add locally + write to Firestore
 *   L7Wallet.onBalChange(fn) — register callback for live Firestore balance updates
 */

var L7Wallet = (function () {
  'use strict';

  var _db        = null;
  var _userId    = null;
  var _balance   = 0;
  var _callbacks = [];
  var _unsub     = null;

  // ── Private helpers ─────────────────────────────────────────────────
  function _log() {
    var args = ['[L7Wallet]'].concat(Array.prototype.slice.call(arguments));
    console.log.apply(console, args);
  }

  function _notify() {
    _callbacks.forEach(function (fn) { try { fn(_balance); } catch (e) {} });
  }

  function _writeToFirestore(delta) {
    if (!_db || !_userId) {
      console.warn('[L7Wallet] Firestore not ready — skipping write. userId=', _userId);
      return Promise.resolve();
    }
    _log('Writing delta', delta, 'to Firestore for user', _userId);
    return _db.collection('users').doc(_userId).update({
      wallet: firebase.firestore.FieldValue.increment(delta)
    }).then(function () {
      _log('Firestore write OK. delta=', delta);
    }).catch(function (err) {
      console.error('[L7Wallet] Firestore write FAILED:', err.message);
    });
  }

  // ── Public API ───────────────────────────────────────────────────────
  return {

    /**
     * init() — must be called once per page load.
     * Reads session, sets up Firestore, starts live balance listener.
     */
    init: function () {
      // Get Firebase db from global
      if (typeof firebase === 'undefined' || !firebase.firestore) {
        console.error('[L7Wallet] Firebase not loaded!');
        return;
      }
      _db = firebase.firestore();

      // Get current user from localStorage session
      var sessStr = localStorage.getItem('l7_current_user');
      if (!sessStr) {
        console.warn('[L7Wallet] No user session found — redirecting to auth');
        location.replace('auth.html');
        return;
      }
      try {
        var u = JSON.parse(sessStr);
        _userId = u.id;
        _log('Session found. userId=', _userId);
      } catch (e) {
        console.error('[L7Wallet] Corrupt session:', e);
        location.replace('auth.html');
        return;
      }

      // Start real-time listener on user doc
      _unsub = _db.collection('users').doc(_userId).onSnapshot(function (snap) {
        if (!snap.exists) {
          console.warn('[L7Wallet] User doc not found in Firestore!');
          return;
        }
        var data = snap.data();
        _balance = typeof data.wallet === 'number' ? data.wallet : 0;
        // Keep localStorage in sync so game pages can read it
        localStorage.setItem('l7_balance', String(_balance));
        _log('Live balance from Firestore:', _balance);
        _notify();
      }, function (err) {
        console.error('[L7Wallet] onSnapshot error:', err.message);
      });

      _log('Wallet initialised. Listening for balance changes...');
    },

    /** Stop the Firestore listener (call on page unload if needed) */
    destroy: function () {
      if (_unsub) { _unsub(); _unsub = null; }
    },

    /** Returns current balance number */
    getBalance: function () { return _balance; },

    /** Returns current userId */
    getUserId: function () { return _userId; },

    /**
     * deduct(amount) — remove coins on win/bet
     * Updates local state immediately, then syncs Firestore.
     * Returns Promise.
     */
    deduct: function (amount) {
      amount = Math.abs(parseInt(amount, 10));
      _log('deduct(', amount, ')  balance before=', _balance);
      _balance -= amount;
      localStorage.setItem('l7_balance', String(_balance));
      _notify();
      return _writeToFirestore(-amount);
    },

    /**
     * credit(amount) — add coins on win/cashout
     * Updates local state immediately, then syncs Firestore.
     * Returns Promise.
     */
    credit: function (amount) {
      amount = Math.abs(parseInt(amount, 10));
      _log('credit(', amount, ')  balance before=', _balance);
      _balance += amount;
      localStorage.setItem('l7_balance', String(_balance));
      _notify();
      return _writeToFirestore(amount);
    },

    /**
     * onBalChange(fn) — register callback called whenever balance changes
     * fn receives the new balance as argument
     */
    onBalChange: function (fn) {
      if (typeof fn === 'function') _callbacks.push(fn);
    }
  };
})();
