/** Convert USD to ETH string with 6 decimal places */
export function usdToEth(usd: number, ethPrice: number): string {
  if (!ethPrice || ethPrice <= 0) return "0.000000";
  return (usd / ethPrice).toFixed(6);
}

/** Convert ETH string to USD string with 2 decimal places */
export function ethToUsd(eth: string, ethPrice: number): string {
  const val = parseFloat(eth);
  if (isNaN(val) || !ethPrice || ethPrice <= 0) return "0.00";
  return (val * ethPrice).toFixed(2);
}

/** Format ETH with USD equivalent: "0.005 ETH (~$12.50)" */
export function formatEthUsd(eth: string, ethPrice: number): string {
  const val = parseFloat(eth);
  if (isNaN(val)) return `${eth} ETH`;
  if (!ethPrice || ethPrice <= 0) return `${eth} ETH`;
  const usd = (val * ethPrice).toFixed(2);
  return `${eth} ETH (~$${usd})`;
}
