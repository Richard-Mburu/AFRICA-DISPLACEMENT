/**
 * Country Centroids Lookup Table
 * Maps ISO3 codes to country names and geographic centroids [latitude, longitude].
 * Includes all African countries and key international origin countries in the dataset.
 */
const CountryCentroids = {
  // Northern Africa
  "DZA": { name: "Algeria", coords: [28.0339, 1.6596] },
  "EGY": { name: "Egypt", coords: [26.8206, 30.8025] },
  "LBY": { name: "Libya", coords: [26.3351, 17.2283] },
  "MAR": { name: "Morocco", coords: [31.7917, -7.0926] },
  "TUN": { name: "Tunisia", coords: [33.8869, 9.5375] },
  "SDN": { name: "Sudan", coords: [12.8628, 30.2176] },

  // Eastern Africa
  "BDI": { name: "Burundi", coords: [-3.3731, 29.9189] },
  "COM": { name: "Comoros", coords: [-11.8750, 43.8722] },
  "DJI": { name: "Djibouti", coords: [11.8251, 42.5903] },
  "ERI": { name: "Eritrea", coords: [15.1794, 39.7823] },
  "ETH": { name: "Ethiopia", coords: [9.1450, 40.4897] },
  "KEN": { name: "Kenya", coords: [-0.0236, 37.9062] },
  "MDG": { name: "Madagascar", coords: [-18.7669, 46.8691] },
  "MWI": { name: "Malawi", coords: [-13.2543, 34.3015] },
  "MUS": { name: "Mauritius", coords: [-20.3484, 57.5522] },
  "MOZ": { name: "Mozambique", coords: [-18.6657, 35.5296] },
  "RWA": { name: "Rwanda", coords: [-1.9403, 29.8739] },
  "SYC": { name: "Seychelles", coords: [-4.6796, 55.4920] },
  "SOM": { name: "Somalia", coords: [5.1521, 46.1996] },
  "SSD": { name: "South Sudan", coords: [6.8770, 31.3070] },
  "TZA": { name: "Tanzania", coords: [-6.3690, 34.8888] },
  "UGA": { name: "Uganda", coords: [1.3733, 32.2903] },
  "ZMB": { name: "Zambia", coords: [-13.1339, 27.8493] },
  "ZWE": { name: "Zimbabwe", coords: [-19.0154, 29.1549] },

  // Middle Africa
  "AGO": { name: "Angola", coords: [-11.2027, 17.8739] },
  "CMR": { name: "Cameroon", coords: [7.3697, 12.3547] },
  "CAF": { name: "Central African Republic", coords: [6.6111, 20.9394] },
  "TCD": { name: "Chad", coords: [15.4542, 18.7322] },
  "COG": { name: "Republic of the Congo", coords: [-0.2280, 15.8277] },
  "COD": { name: "Democratic Republic of the Congo", coords: [-4.0383, 21.7587] },
  "GNQ": { name: "Equatorial Guinea", coords: [1.6508, 10.2679] },
  "GAB": { name: "Gabon", coords: [-0.8037, 11.6094] },
  "STP": { name: "Sao Tome and Principe", coords: [0.1864, 6.6131] },

  // Southern Africa
  "BWA": { name: "Botswana", coords: [-22.3285, 24.6849] },
  "LSO": { name: "Lesotho", coords: [-29.6100, 28.2336] },
  "NAM": { name: "Namibia", coords: [-22.9576, 18.4904] },
  "ZAF": { name: "South Africa", coords: [-30.5595, 22.9375] },
  "SZW": { name: "Eswatini", coords: [-26.5225, 31.4659] }, // Swaziland ISO code SZW
  "SWZ": { name: "Eswatini", coords: [-26.5225, 31.4659] }, // Eswatini ISO code SWZ

  // Western Africa
  "BEN": { name: "Benin", coords: [9.3077, 2.3158] },
  "BFA": { name: "Burkina Faso", coords: [12.2383, -1.5616] },
  "CPV": { name: "Cabo Verde", coords: [16.0022, -24.0131] },
  "CIV": { name: "Côte d'Ivoire", coords: [7.5400, -5.5471] },
  "GMB": { name: "Gambia", coords: [13.4432, -15.3101] },
  "GHA": { name: "Ghana", coords: [7.9465, -1.0232] },
  "GIN": { name: "Guinea", coords: [9.9456, -9.6966] },
  "GNB": { name: "Guinea-Bissau", coords: [11.8037, -15.1804] },
  "LBR": { name: "Liberia", coords: [6.4281, -9.4295] },
  "MLI": { name: "Mali", coords: [17.5707, -3.9962] },
  "MRT": { name: "Mauritania", coords: [21.0079, -10.9408] },
  "NER": { name: "Niger", coords: [17.6078, 8.0817] },
  "NGA": { name: "Nigeria", coords: [9.0820, 8.6753] },
  "SEN": { name: "Senegal", coords: [14.4974, -14.4524] },
  "SLE": { name: "Sierra Leone", coords: [8.4606, -11.7799] },
  "TGO": { name: "Togo", coords: [8.6195, 0.8248] },

  // Non-African Origin Countries present in the dataset
  "SYR": { name: "Syrian Arab Republic", coords: [34.8021, 38.9968] },
  "PAK": { name: "Pakistan", coords: [30.3753, 69.3451] },
  "TUR": { name: "Türkiye", coords: [38.9637, 35.2433] },
  "YEM": { name: "Yemen", coords: [15.5527, 48.5164] },
  "USA": { name: "United States of America", coords: [37.0902, -95.7129] },
  "PSE": { name: "Palestine", coords: [31.9522, 35.2332] },
  "ARE": { name: "United Arab Emirates", coords: [23.4241, 53.8478] },
  "JOR": { name: "Jordan", coords: [30.5852, 36.2384] },
  "IRQ": { name: "Iraq", coords: [33.2232, 43.6793] },
  "BGD": { name: "Bangladesh", coords: [23.6850, 90.3563] }
};
