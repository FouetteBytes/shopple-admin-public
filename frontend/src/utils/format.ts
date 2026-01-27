export const formatNumber = (value?: number | null) => {
    return new Intl.NumberFormat('en-US').format(value ?? 0);
};
