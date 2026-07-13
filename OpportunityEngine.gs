/**
 * Project GATE - DriveService.gs
 * Google Drive操作をFolder ID / File IDだけで行う。
 */
var DriveService = (function () {
  'use strict';

  function getFolder(folderId) {
    if (!folderId) {
      throw Utility.createError('FOLDER_ID_MISSING', 'Folder IDが未設定です。');
    }
    return DriveApp.getFolderById(folderId);
  }

  function listInputZipFiles() {
    var folder = getFolder(Config.getRequired('INPUT_FOLDER_ID'));
    var iterator = folder.getFiles();
    var files = [];
    while (iterator.hasNext()) {
      var file = iterator.next();
      if (/\.zip$/i.test(file.getName())) {
        files.push(file);
      }
    }
    files.sort(function (left, right) {
      return left.getDateCreated().getTime() - right.getDateCreated().getTime();
    });
    return files;
  }

  function saveBlob(folderId, blob, fileName) {
    var target = getFolder(folderId);
    var copy = blob.copyBlob();
    copy.setName(fileName || blob.getName());
    return target.createFile(copy);
  }

  function createTextFile(folderId, fileName, content, mimeType) {
    return getFolder(folderId).createFile(fileName, content, mimeType || MimeType.PLAIN_TEXT);
  }

  function moveFile(file, folderId) {
    file.moveTo(getFolder(folderId));
    return file;
  }

  function getFile(fileId) {
    return DriveApp.getFileById(fileId);
  }

  function readRange(fileId, start, end) {
    var url = 'https://www.googleapis.com/drive/v3/files/' + encodeURIComponent(fileId) + '?alt=media';
    var response = UrlFetchApp.fetch(url, {
      method: 'get',
      headers: {
        Authorization: 'Bearer ' + ScriptApp.getOAuthToken(),
        Range: 'bytes=' + start + '-' + end
      },
      muteHttpExceptions: true
    });
    var status = response.getResponseCode();
    if (status !== 200 && status !== 206) {
      throw Utility.createError(
        'DRIVE_RANGE_READ_FAILED',
        'CSVの分割読込に失敗しました。HTTP ' + status,
        { fileId: fileId, start: start, end: end, response: response.getContentText().slice(0, 500) }
      );
    }
    return response.getBlob().getBytes();
  }

  return {
    getFolder: getFolder,
    listInputZipFiles: listInputZipFiles,
    saveBlob: saveBlob,
    createTextFile: createTextFile,
    moveFile: moveFile,
    getFile: getFile,
    readRange: readRange
  };
}());

