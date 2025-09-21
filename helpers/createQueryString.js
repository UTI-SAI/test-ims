exports.createQueryString = (params) => {
  delete params.page;
  delete params.pageSize;
  return Object.entries(params)
    .map(
      ([key, value]) =>
        `${encodeURIComponent(key)}=${encodeURIComponent(value)}`
    )
    .join("&");
};
