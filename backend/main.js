const { AadhaarQRExtractor } = require('./aadhaar-extractor');

const extractor = new AadhaarQRExtractor();

// Extract from your Aadhaar PDF
extractor.extractFromPDF('./eaadhar.pdf', 'KASH2005')
    .then(details => {
        console.log('Extracted details:', details);
    })
    .catch(error => {
        console.error('Error:', error.message);
    });