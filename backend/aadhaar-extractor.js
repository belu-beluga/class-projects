const fs = require('fs');
const path = require('path');
const { execSync, spawn } = require('child_process');
const sharp = require('sharp');
const jsQR = require('jsqr');

class RobustAadhaarQRExtractor {
    constructor() {
        this.tempDir = './temp/';
        this.ensureTempDir();
    }

    ensureTempDir() {
        if (!fs.existsSync(this.tempDir)) {
            fs.mkdirSync(this.tempDir, { recursive: true });
        }
    }

    /**
     * Method 1: Using pdf-poppler (most reliable)
     */
    async extractUsingPdfPoppler(pdfPath, password) {
        try {
            const pdf = require('pdf-poppler');
            
            console.log('Method 1: Using pdf-poppler...');
            
            const options = {
                format: 'png',
                out_dir: this.tempDir,
                out_prefix: 'page',
                page: null,
                password: password,
                single_file: false
            };

            const res = await pdf.convert(pdfPath, options);
            console.log(`Converted ${res.length} page(s)`);

            for (let i = 1; i <= res.length; i++) {
                const imagePath = path.join(this.tempDir, `page-${i}.png`);
                if (fs.existsSync(imagePath)) {
                    console.log(`Processing page ${i}...`);
                    const qrData = await this.extractQRFromImageFile(imagePath);
                    if (qrData) {
                        return this.parseAadhaarQRData(qrData);
                    }
                }
            }
            return null;
        } catch (error) {
            console.log('pdf-poppler failed:', error.message);
            return null;
        }
    }

    /**
     * Method 2: Using pdf2pic with different configuration
     */
    async extractUsingPdf2Pic(pdfPath, password) {
        try {
            const pdf2pic = require('pdf2pic');
            
            console.log('Method 2: Using pdf2pic...');
            
            const convert = pdf2pic.fromPath(pdfPath, {
                density: 200,
                saveFilename: "page",
                savePath: this.tempDir,
                format: "png",
                width: 1654,
                height: 2339,
                password: password,
                quality: 100
            });

            const results = await convert.bulk(-1, { responseType: "buffer" });
            console.log(`Converted ${results.length} page(s)`);

            for (let i = 0; i < results.length; i++) {
                console.log(`Processing page ${i + 1}...`);
                const qrData = await this.extractQRFromBuffer(results[i].buffer);
                if (qrData) {
                    return this.parseAadhaarQRData(qrData);
                }
            }
            return null;
        } catch (error) {
            console.log('pdf2pic failed:', error.message);
            return null;
        }
    }

    /**
     * Method 3: Using system commands (ghostscript/imagemagick)
     */
    async extractUsingSystemCommands(pdfPath, password) {
        try {
            console.log('Method 3: Using system commands...');
            
            // Try ghostscript first
            try {
                const gsCommand = process.platform === 'win32' ? 'gswin64c' : 'gs';
                const outputPattern = path.join(this.tempDir, 'page_%d.png');
                
                const command = `${gsCommand} -dNOPAUSE -dBATCH -sDEVICE=png16m -r300 -sOutputFile="${outputPattern}" -sPDFPassword="${password}" "${pdfPath}"`;
                
                execSync(command, { stdio: 'pipe' });
                
                // Process generated images
                const files = fs.readdirSync(this.tempDir).filter(f => f.startsWith('page_') && f.endsWith('.png'));
                
                for (const file of files) {
                    console.log(`Processing ${file}...`);
                    const qrData = await this.extractQRFromImageFile(path.join(this.tempDir, file));
                    if (qrData) {
                        return this.parseAadhaarQRData(qrData);
                    }
                }
            } catch (gsError) {
                console.log('Ghostscript not available or failed');
                
                // Try ImageMagick as fallback
                try {
                    const outputPattern = path.join(this.tempDir, 'page.png');
                    const command = `convert -density 300 -authenticate "${password}" "${pdfPath}" "${outputPattern}"`;
                    
                    execSync(command, { stdio: 'pipe' });
                    
                    const files = fs.readdirSync(this.tempDir).filter(f => f.startsWith('page') && f.endsWith('.png'));
                    
                    for (const file of files) {
                        console.log(`Processing ${file}...`);
                        const qrData = await this.extractQRFromImageFile(path.join(this.tempDir, file));
                        if (qrData) {
                            return this.parseAadhaarQRData(qrData);
                        }
                    }
                } catch (imError) {
                    console.log('ImageMagick also failed');
                    return null;
                }
            }
            return null;
        } catch (error) {
            console.log('System commands failed:', error.message);
            return null;
        }
    }

    /**
     * Method 4: Using node-pdftk (if available)
     */
    async extractUsingPdfTk(pdfPath, password) {
        try {
            console.log('Method 4: Using pdftk approach...');
            
            // First, try to decrypt the PDF
            const decryptedPath = path.join(this.tempDir, 'decrypted.pdf');
            
            try {
                // Try pdftk if available
                const command = `pdftk "${pdfPath}" input_pw "${password}" output "${decryptedPath}"`;
                execSync(command, { stdio: 'pipe' });
                
                // Now convert the decrypted PDF
                return await this.extractUsingPdf2Pic(decryptedPath, '');
                
            } catch (pdftkError) {
                console.log('pdftk not available');
                return null;
            }
        } catch (error) {
            console.log('pdftk method failed:', error.message);
            return null;
        }
    }

    /**
     * Main extraction method - tries multiple approaches
     */
    async extractFromPDF(pdfPath, password) {
        if (!fs.existsSync(pdfPath)) {
            throw new Error(`PDF file not found: ${pdfPath}`);
        }

        console.log('Starting multi-method QR extraction...');

        try {
            // Method 1: pdf-poppler
            let result = await this.extractUsingPdfPoppler(pdfPath, password);
            if (result) {
                console.log('✅ Success with pdf-poppler!');
                return result;
            }

            // Method 2: pdf2pic
            result = await this.extractUsingPdf2Pic(pdfPath, password);
            if (result) {
                console.log('✅ Success with pdf2pic!');
                return result;
            }

            // Method 3: System commands
            result = await this.extractUsingSystemCommands(pdfPath, password);
            if (result) {
                console.log('✅ Success with system commands!');
                return result;
            }

            // Method 4: pdftk
            result = await this.extractUsingPdfTk(pdfPath, password);
            if (result) {
                console.log('✅ Success with pdftk!');
                return result;
            }

            throw new Error('All extraction methods failed. Please check if:\n1. PDF file is valid\n2. Password is correct\n3. PDF contains a QR code\n4. Required system tools are installed');

        } finally {
            this.cleanup();
        }
    }

    async extractQRFromImageFile(imagePath) {
        try {
            const { data, info } = await sharp(imagePath)
                .greyscale()
                .normalise()
                .sharpen()
                .ensureAlpha()
                .raw()
                .toBuffer({ resolveWithObject: true });
            
            const imageData = new Uint8ClampedArray(data);
            const qrCode = jsQR(imageData, info.width, info.height);
            
            return qrCode ? qrCode.data : null;
            
        } catch (error) {
            console.error(`Error processing image ${imagePath}:`, error.message);
            return null;
        }
    }

    async extractQRFromBuffer(buffer) {
        try {
            const { data, info } = await sharp(buffer)
                .greyscale()
                .normalise()
                .sharpen()
                .ensureAlpha()
                .raw()
                .toBuffer({ resolveWithObject: true });
            
            const imageData = new Uint8ClampedArray(data);
            const qrCode = jsQR(imageData, info.width, info.height);
            
            return qrCode ? qrCode.data : null;
            
        } catch (error) {
            console.error('Error processing image buffer:', error.message);
            return null;
        }
    }

    parseAadhaarQRData(qrData) {
        try {
            console.log('QR Data found, length:', qrData.length);
            
            const extractField = (fieldName, data) => {
                const regex = new RegExp(`${fieldName}="([^"]*)"`, 'i');
                const match = data.match(regex);
                return match ? match[1] : '';
            };

            const aadhaarDetails = {
                rawData: qrData, // Include raw data for debugging
                name: this.decodeValue(extractField('name', qrData)),
                aadhaarNumber: extractField('uid', qrData),
                dateOfBirth: extractField('dob', qrData),
                gender: extractField('gender', qrData),
                careOf: this.decodeValue(extractField('co', qrData)),
                district: this.decodeValue(extractField('dist', qrData)),
                house: this.decodeValue(extractField('house', qrData)),
                location: this.decodeValue(extractField('loc', qrData)),
                pincode: extractField('pc', qrData),
                postOffice: this.decodeValue(extractField('po', qrData)),
                state: this.decodeValue(extractField('state', qrData)),
                street: this.decodeValue(extractField('street', qrData)),
                vtc: this.decodeValue(extractField('vtc', qrData)),
                email: extractField('email', qrData),
                mobile: extractField('mobile', qrData)
            };

            // Remove empty fields (except rawData)
            Object.keys(aadhaarDetails).forEach(key => {
                if (key !== 'rawData' && !aadhaarDetails[key]) {
                    delete aadhaarDetails[key];
                }
            });

            return aadhaarDetails;

        } catch (error) {
            throw new Error('Failed to parse QR code data: ' + error.message);
        }
    }

    decodeValue(value) {
        if (!value) return '';
        
        try {
            // Try base64 decode
            const decoded = Buffer.from(value, 'base64').toString('utf8');
            return /^[\x20-\x7E\u00A0-\uFFFF]*$/.test(decoded) ? decoded : value;
        } catch (error) {
            return value;
        }
    }

    formatAddress(details) {
        const addressParts = [
            details.house,
            details.street,
            details.location,
            details.vtc,
            details.postOffice,
            details.district,
            details.state,
            details.pincode
        ].filter(part => part && part.trim());

        return addressParts.join(', ');
    }

    cleanup() {
        try {
            if (fs.existsSync(this.tempDir)) {
                const files = fs.readdirSync(this.tempDir);
                files.forEach(file => {
                    try {
                        fs.unlinkSync(path.join(this.tempDir, file));
                    } catch (e) {
                        // Ignore file deletion errors
                    }
                });
            }
        } catch (error) {
            console.warn('Warning: Could not clean up temp files:', error.message);
        }
    }
}

// Usage
async function main() {
    const extractor = new RobustAadhaarQRExtractor();
    
    try {
        const pdfPath = './aadhaar.pdf'; // Your PDF path
        const password = 'your_password_here'; // Your PDF password
        
        console.log('Starting robust Aadhaar QR extraction...');
        const details = await extractor.extractFromPDF(pdfPath, password);
        
        console.log('\n=== EXTRACTED AADHAAR DETAILS ===');
        console.log('Name:', details.name);
        console.log('Aadhaar Number:', details.aadhaarNumber);
        console.log('Date of Birth:', details.dateOfBirth);
        console.log('Gender:', details.gender);
        console.log('Mobile:', details.mobile);
        console.log('Email:', details.email);
        
        if (details.house || details.street || details.location) {
            console.log('Address:', extractor.formatAddress(details));
        }
        
        console.log('\n=== COMPLETE DETAILS ===');
        const cleanDetails = { ...details };
        delete cleanDetails.rawData; // Remove raw data from display
        console.log(JSON.stringify(cleanDetails, null, 2));
        
        // Save to file
        fs.writeFileSync('extracted_details.json', JSON.stringify(cleanDetails, null, 2));
        console.log('\nDetails saved to extracted_details.json');
        
    } catch (error) {
        console.error('\n❌ Extraction failed:', error.message);
        console.error('\n🔧 Installation help:');
        console.error('npm install pdf-poppler pdf2pic sharp jsqr');
        console.error('\n📋 System requirements:');
        console.error('- Windows: Install poppler from http://blog.alivate.com.au/poppler-windows/');
        console.error('- macOS: brew install poppler');
        console.error('- Linux: sudo apt-get install poppler-utils');
    }
}

if (require.main === module) {
    main();
}

module.exports = { RobustAadhaarQRExtractor };