const sendResponse = (res, statusCode, data, message = '') => {
  res.status(statusCode).json({
    success: statusCode >= 200 && statusCode < 300,
    data: data || null,
    message
  });
};

const snakeToCamel = (obj) => {
  if (Array.isArray(obj)) {
    return obj.map(v => snakeToCamel(v));
  } else if (obj !== null && typeof obj === 'object') {
    return Object.keys(obj).reduce((result, key) => {
      const camelKey = key.replace(/([-_][a-z])/ig, ($1) => {
        return $1.toUpperCase().replace('-', '').replace('_', '');
      });
      result[camelKey] = snakeToCamel(obj[key]);
      return result;
    }, {});
  }
  return obj;
};

module.exports = { sendResponse, snakeToCamel };
