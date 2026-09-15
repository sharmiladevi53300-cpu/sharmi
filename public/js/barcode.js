/**
 * Readymade Shop - Barcode Generator & Label Printing Engine
 * Zero-dependency, 100% Vector Code-128 SVG Barcode & Simple Retail Label Generator
 */

const BarcodeEngine = {
  CODE128_PATTERNS: [
    '212222', '222122', '222221', '121223', '121322', '131222', '122213', '122312', '132212', '221213',
    '221312', '231212', '112232', '122132', '122231', '113222', '123122', '123221', '223211', '221132',
    '221231', '213212', '223112', '312131', '311222', '321122', '321221', '312212', '322112', '322211',
    '212123', '212321', '232121', '111323', '131123', '131321', '112313', '132113', '132311', '211313',
    '231113', '231311', '112133', '112331', '132131', '113123', '113321', '133121', '313121', '211331',
    '231131', '213113', '213311', '213131', '311123', '311321', '331121', '312113', '312311', '332111',
    '314111', '221411', '431111', '111224', '111422', '121124', '121421', '141122', '141221', '112214',
    '112412', '122114', '122411', '142112', '142211', '241211', '221114', '413111', '241112', '134111',
    '111242', '121142', '121241', '114212', '124112', '124211', '411212', '421112', '421211', '212141',
    '214121', '412121', '111143', '111341', '131141', '114113', '114311', '411113', '411311', '113141',
    '114131', '311141', '411131', '211412', '211214', '211232', '2331112'
  ],

  START_B: 104,
  STOP: 106,

  encodeCode128B(text) {
    const cleanText = String(text).trim();
    if (!cleanText) return null;

    const values = [this.START_B];
    let checksum = this.START_B;

    for (let i = 0; i < cleanText.length; i++) {
      const code = cleanText.charCodeAt(i) - 32;
      if (code < 0 || code > 95) continue;
      values.push(code);
      checksum += code * (i + 1);
    }

    const checkDigit = checksum % 103;
    values.push(checkDigit);
    values.push(this.STOP);

    return values;
  },

  generateSVG(text, options = {}) {
    const opt = {
      width: options.width || 1.8,
      height: options.height || 36,
      showText: options.showText !== false,
      fontSize: options.fontSize || 11,
      fontFamily: options.fontFamily || 'monospace',
      quietZone: options.quietZone !== undefined ? options.quietZone : 8,
      color: options.color || '#000000',
      bgColor: options.bgColor || 'transparent',
      ...options
    };

    const values = this.encodeCode128B(text);
    if (!values) return '<svg width="100" height="30"><text y="15">Invalid Code</text></svg>';

    let binaryStr = '';
    for (let i = 0; i < values.length; i++) {
      const pattern = this.CODE128_PATTERNS[values[i]];
      if (!pattern) continue;

      let isBar = true;
      for (let j = 0; j < pattern.length; j++) {
        const width = parseInt(pattern[j], 10);
        binaryStr += (isBar ? '1' : '0').repeat(width);
        isBar = !isBar;
      }
    }

    const barWidth = opt.width;
    const totalBarsWidth = binaryStr.length * barWidth;
    const svgWidth = totalBarsWidth + (opt.quietZone * 2);
    const textHeight = opt.showText ? opt.fontSize + 3 : 0;
    const svgHeight = opt.height + textHeight + 2;

    let rects = '';
    let currentBarStart = null;
    let currentBarLen = 0;

    for (let i = 0; i < binaryStr.length; i++) {
      if (binaryStr[i] === '1') {
        if (currentBarStart === null) currentBarStart = i;
        currentBarLen++;
      } else {
        if (currentBarStart !== null) {
          const x = opt.quietZone + (currentBarStart * barWidth);
          const w = currentBarLen * barWidth;
          rects += `<rect x="${x}" y="1" width="${w}" height="${opt.height}" fill="${opt.color}" />`;
          currentBarStart = null;
          currentBarLen = 0;
        }
      }
    }
    if (currentBarStart !== null) {
      const x = opt.quietZone + (currentBarStart * barWidth);
      const w = currentBarLen * barWidth;
      rects += `<rect x="${x}" y="1" width="${w}" height="${opt.height}" fill="${opt.color}" />`;
    }

    let textElement = '';
    if (opt.showText) {
      const textY = opt.height + opt.fontSize + 1;
      textElement = `<text x="${svgWidth / 2}" y="${textY}" font-family="${opt.fontFamily}" font-size="${opt.fontSize}" font-weight="bold" fill="${opt.color}" text-anchor="middle" letter-spacing="2">${text}</text>`;
    }

    return `
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${svgWidth} ${svgHeight}" width="${svgWidth}" height="${svgHeight}" style="background-color: ${opt.bgColor}; display: block; margin: 0 auto; max-width: 100%;">
        ${rects}
        ${textElement}
      </svg>
    `.trim();
  },

  generateUniqueBarcode(existingList = []) {
    const existingCodes = new Set(existingList.map(p => String(p.barcode || '')));
    let code = '';
    do {
      const randomNum = Math.floor(100000 + Math.random() * 900000);
      code = `890${randomNum}`;
    } while (existingCodes.has(code));
    return code;
  },

  /**
   * Ultra-clean, Simple Retail Garment Barcode Label
   */
  generateLabelHTML(product, options = {}) {
    const {
      shopName = 'READYMADE SHOP',
      size = '50x25',
      quantity = 1,
      showShop = true,
      showPrice = true,
      showVariant = true
    } = options;

    const mrp = Number(product.mrp || product.sellingPrice || 0);
    const sellingPrice = Number(product.sellingPrice || 0);
    const barcodeCode = product.barcode || product.sku || product.id || '8901001';

    let barHeight = 24;
    let barUnit = 1.3;
    if (size === '38x25') {
      barHeight = 18;
      barUnit = 1.0;
    } else if (size === '50x35') {
      barHeight = 30;
      barUnit = 1.4;
    }

    const barcodeSVG = this.generateSVG(barcodeCode, {
      height: barHeight,
      width: barUnit,
      showText: true,
      fontSize: 10,
      quietZone: 4
    });

    const singleLabel = `
      <div class="rms-barcode-label label-${size}">
        ${showShop ? `<div class="label-shop-name">${shopName}</div>` : ''}
        <div class="label-product-name" title="${product.name}">${product.name}</div>
        
        <div class="label-barcode-wrapper">
          ${barcodeSVG}
        </div>

        <div class="label-bottom-row">
          ${showVariant ? `<div class="label-size">Size: <strong>${product.size || 'Free'}</strong></div>` : '<div></div>'}
          ${showPrice ? `
            <div class="label-price">
              ${mrp > sellingPrice ? `<span class="label-mrp">₹${mrp.toFixed(0)}</span>` : ''}
              <span class="label-selling">₹${sellingPrice.toFixed(0)}</span>
            </div>
          ` : ''}
        </div>
      </div>
    `;

    let allLabels = '';
    const count = Math.max(1, parseInt(quantity, 10) || 1);
    for (let i = 0; i < count; i++) {
      allLabels += singleLabel;
    }

    return allLabels;
  },

  openLabelModal(product, cachedList = []) {
    let modal = document.getElementById('rmsBarcodeLabelModal');
    if (!modal) {
      modal = document.createElement('div');
      modal.id = 'rmsBarcodeLabelModal';
      modal.className = 'modal-backdrop';
      modal.innerHTML = `
        <div class="modal-box" style="max-width: 580px; padding: 0; overflow: hidden; border-radius: 12px; box-shadow: 0 20px 25px -5px rgba(0,0,0,0.2);">
          <!-- Header -->
          <div class="modal-header" style="background: #0f172a; color: white; padding: 14px 20px; display: flex; justify-content: space-between; align-items: center;">
            <div style="display: flex; align-items: center; gap: 8px;">
              <span style="font-size: 22px;">🏷️</span>
              <div>
                <h3 style="font-size: 16px; font-weight: 700; margin: 0; color:#fff;">Print Barcode Label</h3>
                <div style="font-size: 11px; color: #94a3b8;">Simple & crisp retail garment price tag sticker</div>
              </div>
            </div>
            <button class="btn btn-outline btn-sm" onclick="BarcodeEngine.closeLabelModal()" style="color: white; border-color: rgba(255,255,255,0.3); background: transparent; font-size: 14px;">✕</button>
          </div>

          <!-- Body -->
          <div class="modal-body" style="padding: 18px 20px; max-height: calc(85vh - 120px); overflow-y: auto;">
            
            <!-- Quick Settings Bar -->
            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-bottom: 16px; background: #f8fafc; padding: 14px; border-radius: 8px; border: 1px solid #e2e8f0;">
              
              <div class="form-group" style="margin-bottom: 0;">
                <label style="font-size: 11px; font-weight: 700; color: #334155; margin-bottom: 4px;">Sticker Size</label>
                <select id="lblModalSize" class="form-control" style="font-size: 12px; padding: 6px 10px;" onchange="BarcodeEngine.updatePreview()">
                  <option value="50x25" selected>50mm x 25mm (Standard Retail Sticker)</option>
                  <option value="50x35">50mm x 35mm (Medium Hangtag)</option>
                  <option value="38x25">38mm x 25mm (Compact 1.5" x 1")</option>
                </select>
              </div>

              <div class="form-group" style="margin-bottom: 0;">
                <label style="font-size: 11px; font-weight: 700; color: #334155; margin-bottom: 4px;">Number of Labels to Print</label>
                <div style="display: flex; gap: 6px;">
                  <input type="number" id="lblModalQty" class="form-control" value="1" min="1" max="200" style="font-size: 12px; padding: 6px 10px; width: 70px;" oninput="BarcodeEngine.updatePreview()">
                  <button type="button" class="btn btn-outline btn-sm" onclick="BarcodeEngine.setStockQty()" style="font-size: 11px; white-space: nowrap; padding: 6px 10px; background: white;">
                    Full Stock (<span id="lblModalStockVal">0</span>)
                  </button>
                </div>
              </div>

              <div class="form-group" style="margin-bottom: 0;">
                <label style="font-size: 11px; font-weight: 700; color: #334155; margin-bottom: 4px;">Shop / Brand Name</label>
                <input type="text" id="lblModalShopName" class="form-control" value="READYMADE SHOP" style="font-size: 12px; padding: 6px 10px;" oninput="BarcodeEngine.updatePreview()">
              </div>

              <div class="form-group" style="margin-bottom: 0; display: flex; flex-direction: column; justify-content: center;">
                <label style="font-size: 11px; font-weight: 700; color: #334155; margin-bottom: 4px;">Options</label>
                <div style="display: flex; gap: 12px; font-size: 11px; align-items: center;">
                  <label style="display: flex; align-items: center; gap: 4px; cursor: pointer;">
                    <input type="checkbox" id="lblChkShop" checked onchange="BarcodeEngine.updatePreview()"> Shop Name
                  </label>
                  <label style="display: flex; align-items: center; gap: 4px; cursor: pointer;">
                    <input type="checkbox" id="lblChkPrice" checked onchange="BarcodeEngine.updatePreview()"> Price (₹)
                  </label>
                  <label style="display: flex; align-items: center; gap: 4px; cursor: pointer;">
                    <input type="checkbox" id="lblChkVariant" checked onchange="BarcodeEngine.updatePreview()"> Size
                  </label>
                </div>
              </div>

            </div>

            <!-- Preview Header -->
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">
              <div style="font-weight: 700; font-size: 12px; color: #475569; text-transform: uppercase;">Sticker Preview</div>
              <div style="font-size: 11px; color: #64748b;" id="lblPreviewSummary">1 Label</div>
            </div>

            <!-- Preview Sheet -->
            <div id="lblPreviewContainer" class="label-preview-sheet" style="background: #e2e8f0; padding: 18px; border-radius: 8px; max-height: 260px; overflow-y: auto; display: flex; flex-wrap: wrap; gap: 12px; justify-content: center; align-items: center; border: 1px dashed #cbd5e1;">
              <!-- Stickers injected here -->
            </div>

          </div>

          <!-- Footer -->
          <div class="modal-footer" style="padding: 12px 20px; background: #f8fafc; border-top: 1px solid #e2e8f0; display: flex; justify-content: space-between; align-items: center;">
            <button type="button" class="btn btn-outline" onclick="BarcodeEngine.closeLabelModal()" style="font-size: 13px;">Cancel</button>
            <button type="button" class="btn btn-purple" onclick="BarcodeEngine.printLabels()" style="font-size: 13px; font-weight: 700; padding: 8px 20px; display: flex; align-items: center; gap: 6px; background: #4f46e5;">
              <span>🖨️</span> Print Barcode
            </button>
          </div>
        </div>
      `;
      document.body.appendChild(modal);

      if (!document.getElementById('rmsBarcodeLabelStyles')) {
        const style = document.createElement('style');
        style.id = 'rmsBarcodeLabelStyles';
        style.textContent = `
          /* Simple Clean Barcode Label Design */
          .rms-barcode-label {
            background: #ffffff;
            border: 1px solid #000000;
            box-shadow: 0 1px 3px rgba(0,0,0,0.08);
            border-radius: 3px;
            padding: 4px 6px;
            display: flex;
            flex-direction: column;
            align-items: center;
            justify-content: space-between;
            box-sizing: border-box;
            text-align: center;
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Arial, sans-serif;
            page-break-inside: avoid;
            break-inside: avoid;
            background-color: #fff;
          }

          .label-50x25 {
            width: 185px;
            height: 95px;
            padding: 4px 6px;
          }

          .label-50x35 {
            width: 185px;
            height: 130px;
            padding: 6px 8px;
          }

          .label-38x25 {
            width: 145px;
            height: 90px;
            padding: 3px 4px;
          }

          .label-shop-name {
            font-size: 9px;
            font-weight: 900;
            letter-spacing: 0.8px;
            text-transform: uppercase;
            color: #000;
            border-bottom: 1px solid #000;
            padding-bottom: 1px;
            width: 100%;
            margin-bottom: 2px;
          }

          .label-product-name {
            font-size: 10.5px;
            font-weight: 700;
            color: #000;
            line-height: 1.15;
            max-width: 100%;
            white-space: nowrap;
            overflow: hidden;
            text-overflow: ellipsis;
            margin-bottom: 1px;
          }

          .label-barcode-wrapper {
            width: 100%;
            display: flex;
            justify-content: center;
            align-items: center;
            margin: 1px 0;
          }

          .label-barcode-wrapper svg {
            width: 100%;
            height: auto;
          }

          .label-bottom-row {
            display: flex;
            justify-content: space-between;
            align-items: center;
            width: 100%;
            border-top: 1px dashed #666;
            padding-top: 2px;
            margin-top: 1px;
          }

          .label-size {
            font-size: 9px;
            font-weight: 600;
            color: #000;
          }

          .label-price {
            font-size: 11px;
            font-weight: 900;
            color: #000;
          }

          .label-mrp {
            font-size: 8.5px;
            text-decoration: line-through;
            color: #666;
            margin-right: 2px;
          }

          /* PRINT SPECIFIC STYLES */
          @media print {
            body * {
              visibility: hidden !important;
            }
            #lblPreviewContainer, #lblPreviewContainer * {
              visibility: visible !important;
            }
            #lblPreviewContainer {
              position: absolute !important;
              left: 0 !important;
              top: 0 !important;
              width: 100% !important;
              max-height: none !important;
              overflow: visible !important;
              background: #fff !important;
              padding: 0 !important;
              margin: 0 !important;
              border: none !important;
              display: flex !important;
              flex-wrap: wrap !important;
              gap: 2mm !important;
              justify-content: flex-start !important;
            }
            .rms-barcode-label {
              box-shadow: none !important;
              border: 1px solid #000 !important;
              margin: 0 !important;
            }
          }
        `;
        document.head.appendChild(style);
      }
    }

    this._currentProduct = product;
    document.getElementById('lblModalStockVal').textContent = product.stockQuantity || 1;
    document.getElementById('lblModalQty').value = 1;
    
    this.updatePreview();
    modal.classList.add('show');
  },

  setStockQty() {
    if (this._currentProduct) {
      document.getElementById('lblModalQty').value = this._currentProduct.stockQuantity || 1;
      this.updatePreview();
    }
  },

  updatePreview() {
    if (!this._currentProduct) return;

    const size = document.getElementById('lblModalSize').value;
    const qty = parseInt(document.getElementById('lblModalQty').value, 10) || 1;
    const shopName = document.getElementById('lblModalShopName').value || 'READYMADE SHOP';
    const showShop = document.getElementById('lblChkShop').checked;
    const showPrice = document.getElementById('lblChkPrice').checked;
    const showVariant = document.getElementById('lblChkVariant').checked;

    const container = document.getElementById('lblPreviewContainer');
    const summary = document.getElementById('lblPreviewSummary');

    summary.textContent = `Printing ${qty} sticker${qty > 1 ? 's' : ''} (${size}mm)`;

    const labelsHtml = this.generateLabelHTML(this._currentProduct, {
      shopName,
      size,
      quantity: qty,
      showShop,
      showPrice,
      showVariant
    });

    container.innerHTML = labelsHtml;
  },

  printLabels() {
    window.print();
  },

  closeLabelModal() {
    const modal = document.getElementById('rmsBarcodeLabelModal');
    if (modal) modal.classList.remove('show');
  }
};

window.BarcodeEngine = BarcodeEngine;
