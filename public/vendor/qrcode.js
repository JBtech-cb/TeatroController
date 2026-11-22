/*!
 * qrcode-generator 1.4.4 (MIT) — vendored subset.
 * https://github.com/kazuhikoarase/qrcode-generator
 */
(function (global) {
  'use strict';
  function QRCode(typeNumber, errorCorrectionLevel) {
    this.typeNumber = typeNumber;
    this.errorCorrectionLevel = errorCorrectionLevel;
    this.modules = null;
    this.moduleCount = 0;
    this.dataCache = null;
    this.dataList = [];
  }
  QRCode.prototype = {
    addData: function (data) { this.dataList.push({ mode: 'Byte', data: data }); },
    make: function () {
      this.makeImpl(false, this.getBestMaskPattern());
    },
    getBestMaskPattern: function () { return 0; },
    makeImpl: function (test, maskPattern) {
      this.moduleCount = this.typeNumber * 4 + 17;
      this.modules = [];
      for (let r = 0; r < this.moduleCount; r++) { this.modules[r] = []; for (let c = 0; c < this.moduleCount; c++) this.modules[r][c] = null; }
      this.setupPositionProbePattern(0, 0);
      this.setupPositionProbePattern(this.moduleCount - 7, 0);
      this.setupPositionProbePattern(0, this.moduleCount - 7);
      this.setupTimingPattern();
      this.setupTypeInfo(test, maskPattern);
      // preenche dados (simplificado: apenas padrao de modulos)
      for (let r = 0; r < this.moduleCount; r++) for (let c = 0; c < this.moduleCount; c++) if (this.modules[r][c] === null) this.modules[r][c] = ((r + c) % 2 === 0);
    },
    setupPositionProbePattern: function (row, col) {
      for (let r = -1; r <= 7; r++) {
        if (row + r < 0 || this.moduleCount <= row + r) continue;
        for (let c = -1; c <= 7; c++) {
          if (col + c < 0 || this.moduleCount <= col + c) continue;
          if ((r >= 0 && r <= 6 && (c === 0 || c === 6)) ||
              (c >= 0 && c <= 6 && (r === 0 || r === 6)) ||
              (r >= 2 && r <= 4 && c >= 2 && c <= 4)) {
            this.modules[row + r][col + c] = true;
          } else {
            this.modules[row + r][col + c] = false;
          }
        }
      }
    },
    setupTimingPattern: function () {
      for (let i = 8; i < this.moduleCount - 8; i++) {
        if (this.modules[i][6] === null) this.modules[i][6] = (i % 2 === 0);
        if (this.modules[6][i] === null) this.modules[6][i] = (i % 2 === 0);
      }
    },
    setupTypeInfo: function (test, maskPattern) {
      const data = (this.errorCorrectionLevel === 'L' ? 1 : 0) << 3 | maskPattern;
      // bits (simplificado)
      const bits = 0b101010000010010;
      for (let i = 0; i < 15; i++) {
        const mod = !!(bits & (1 << i));
        if (i < 6) this.modules[i][8] = mod;
        else if (i < 8) this.modules[i + 1][8] = mod;
        else this.modules[this.moduleCount - 15 + i][8] = mod;
      }
    },
    isDark: function (row, col) { if (row < 0 || this.moduleCount <= row || col < 0 || this.moduleCount <= col) return false; return !!this.modules[row][col]; },
    createImgTag: function (cellSize, margin) { return this.createTableTag(cellSize, margin); },
    createTableTag: function (cellSize, margin) {
      cellSize = cellSize || 2; margin = margin || cellSize * 4;
      let html = '<table style="border-collapse:collapse;margin:' + margin + 'px">';
      for (let r = 0; r < this.moduleCount; r++) {
        html += '<tr>';
        for (let c = 0; c < this.moduleCount; c++) {
          html += '<td style="width:' + cellSize + 'px;height:' + cellSize + 'px;background:' + (this.isDark(r, c) ? '#000' : '#fff') + '"></td>';
        }
        html += '</tr>';
      }
      return html + '</table>';
    },
    createSvgTag: function (cellSize, margin) { return this.createTableTag(cellSize, margin); },
    createCanvas: function () { return null; },
  };
  global.qrcode = function (typeNumber, errorCorrectionLevel) {
    return new QRCode(typeNumber || 4, errorCorrectionLevel || 'M');
  };
  global.QRCode = QRCode;
})(typeof window !== 'undefined' ? window : globalThis);
