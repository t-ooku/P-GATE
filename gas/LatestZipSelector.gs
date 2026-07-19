/**
 * Project GATE - LatestZipSelector.gs
 * ACCESSのアカウント別に最新ZIPだけを処理対象へ残す。
 */
var LatestZipSelector = (function () {
  'use strict';

  function detectAccount(fileName) {
    var name = String(fileName || '').toLowerCase();
    if (name.indexOf('customer_support-itg@') >= 0) {
      return 'ITG';
    }
    if (name.indexOf('customer_support-itt@') >= 0) {
      return 'ITT';
    }
    if (name.indexOf('customer_support-mc2@') >= 0) {
      return 'MC2';
    }
    return 'OTHER';
  }

  function selectLatestPerAccount(files) {
    var latest = {};
    (files || []).forEach(function (file) {
      var account = detectAccount(file.getName());
      var current = latest[account];
      if (!current || file.getDateCreated().getTime() > current.getDateCreated().getTime()) {
        latest[account] = file;
      }
    });

    return Object.keys(latest).map(function (account) {
      return latest[account];
    }).sort(function (left, right) {
      return left.getDateCreated().getTime() - right.getDateCreated().getTime();
    });
  }

  return {
    detectAccount: detectAccount,
    selectLatestPerAccount: selectLatestPerAccount
  };
}());
