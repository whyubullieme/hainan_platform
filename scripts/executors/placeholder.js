module.exports = {
  supports: () => false,
  run: async () => {
    throw new Error('placeholder executor should never be invoked');
  },
};
