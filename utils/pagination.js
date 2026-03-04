function buildPagination(list = [], currentPage = 1, pageSize = 8) {
  const normalizedList = Array.isArray(list) ? list : [];
  const safeSize = Math.max(1, Number(pageSize) || 8);
  const totalPages = Math.max(1, Math.ceil(normalizedList.length / safeSize));
  const safePage = Math.min(Math.max(Number(currentPage) || 1, 1), totalPages);
  const start = (safePage - 1) * safeSize;
  const end = start + safeSize;
  return {
    pageItems: normalizedList.slice(start, end),
    totalPages,
    currentPage: safePage,
    pageSize: safeSize,
    totalItems: normalizedList.length
  };
}

module.exports = {
  buildPagination
};
