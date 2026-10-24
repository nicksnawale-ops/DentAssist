export const fdiToUniversal = (fdi: string): string => {
  const map: Record<string, string> = {
    // Upper Right
    '18': '1', '17': '2', '16': '3', '15': '4', '14': '5', '13': '6', '12': '7', '11': '8',
    // Upper Left
    '21': '9', '22': '10', '23': '11', '24': '12', '25': '13', '26': '14', '27': '15', '28': '16',
    // Lower Left
    '38': '17', '37': '18', '36': '19', '35': '20', '34': '21', '33': '22', '32': '23', '31': '24',
    // Lower Right
    '41': '25', '42': '26', '43': '27', '44': '28', '45': '29', '46': '30', '47': '31', '48': '32',
    
    // Pediatric Upper Right
    '55': 'A', '54': 'B', '53': 'C', '52': 'D', '51': 'E',
    // Pediatric Upper Left
    '61': 'F', '62': 'G', '63': 'H', '64': 'I', '65': 'J',
    // Pediatric Lower Left
    '75': 'K', '74': 'L', '73': 'M', '72': 'N', '71': 'O',
    // Pediatric Lower Right
    '81': 'P', '82': 'Q', '83': 'R', '84': 'S', '85': 'T',
  };
  return map[fdi] || fdi;
};

export const adultTeethFDI = {
  upper: ['18', '17', '16', '15', '14', '13', '12', '11', '21', '22', '23', '24', '25', '26', '27', '28'],
  lower: ['48', '47', '46', '45', '44', '43', '42', '41', '31', '32', '33', '34', '35', '36', '37', '38']
};

export const pediatricTeethFDI = {
  upper: ['55', '54', '53', '52', '51', '61', '62', '63', '64', '65'],
  lower: ['85', '84', '83', '82', '81', '71', '72', '73', '74', '75']
};

export const getToothNumber = (fdi: string, numberingSystem: 'FDI' | 'Universal') => {
  return numberingSystem === 'Universal' ? fdiToUniversal(fdi) : fdi;
};
