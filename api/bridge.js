const supabaseHandler = require('./supabase');

module.exports = async function handler(req, res) {
  // Alihkan seluruh request ke Backend Supabase Performa Tinggi
  return await supabaseHandler(req, res);
};
