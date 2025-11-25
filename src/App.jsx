import { useState, useEffect, useCallback } from 'react';

const App = () => {
  const [assets, setAssets] = useState([]);
  const [currency, setCurrency] = useState('eur');
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [isSearching, setIsSearching] = useState(false);
  const [showSearch, setShowSearch] = useState(false);
  const [totalValue, setTotalValue] = useState(0);
  const [pricesLoading, setPricesLoading] = useState(false);

  const currencySymbol = currency === 'eur' ? '€' : '$';

  // Debounced search
  useEffect(() => {
    if (searchQuery.length < 2) {
      setSearchResults([]);
      return;
    }

    const timer = setTimeout(async () => {
      setIsSearching(true);
      try {
        const response = await fetch(
          `https://api.coingecko.com/api/v3/search?query=${encodeURIComponent(searchQuery)}`
        );
        const data = await response.json();
        setSearchResults(data.coins?.slice(0, 8) || []);
      } catch (error) {
        console.error('Search failed:', error);
        setSearchResults([]);
      }
      setIsSearching(false);
    }, 500);

    return () => clearTimeout(timer);
  }, [searchQuery]);

  // Fetch prices for all assets
  const fetchPrices = useCallback(async () => {
    if (assets.length === 0) return;
    
    setPricesLoading(true);
    const ids = assets.map(a => a.id).join(',');
    
    try {
      const response = await fetch(
        `https://api.coingecko.com/api/v3/simple/price?ids=${ids}&vs_currencies=eur,usd`
      );
      const data = await response.json();
      
      setAssets(prev => prev.map(asset => ({
        ...asset,
        priceEur: data[asset.id]?.eur || asset.priceEur || 0,
        priceUsd: data[asset.id]?.usd || asset.priceUsd || 0,
      })));
    } catch (error) {
      console.error('Price fetch failed:', error);
    }
    setPricesLoading(false);
  }, [assets.length]);

  // Fetch prices on mount and when assets change
  useEffect(() => {
    if (assets.length > 0) {
      fetchPrices();
    }
  }, [assets.length]);

  // Calculate total value
  useEffect(() => {
    const total = assets.reduce((sum, asset) => {
      const price = currency === 'eur' ? asset.priceEur : asset.priceUsd;
      return sum + (asset.holdings * (price || 0));
    }, 0);
    setTotalValue(total);
  }, [assets, currency]);

  const addAsset = (coin) => {
    if (assets.find(a => a.id === coin.id)) {
      setShowSearch(false);
      setSearchQuery('');
      return;
    }

    const newAsset = {
      id: coin.id,
      symbol: coin.symbol.toUpperCase(),
      name: coin.name,
      thumb: coin.thumb,
      holdings: 0,
      targetPercent: 0,
      priceEur: 0,
      priceUsd: 0,
    };

    setAssets([...assets, newAsset]);
    setShowSearch(false);
    setSearchQuery('');
    setSearchResults([]);

    // Fetch price for new asset
    setTimeout(async () => {
      try {
        const response = await fetch(
          `https://api.coingecko.com/api/v3/simple/price?ids=${coin.id}&vs_currencies=eur,usd`
        );
        const data = await response.json();
        
        setAssets(prev => prev.map(asset => 
          asset.id === coin.id 
            ? { ...asset, priceEur: data[coin.id]?.eur || 0, priceUsd: data[coin.id]?.usd || 0 }
            : asset
        ));
      } catch (error) {
        console.error('Price fetch failed:', error);
      }
    }, 100);
  };

  const removeAsset = (id) => {
    setAssets(assets.filter(a => a.id !== id));
  };

  const updateHoldings = (id, value) => {
    setAssets(assets.map(a => 
      a.id === id ? { ...a, holdings: parseFloat(value) || 0 } : a
    ));
  };

  const updateTarget = (id, value) => {
    const newValue = Math.min(100, Math.max(0, parseFloat(value) || 0));
    setAssets(assets.map(a => 
      a.id === id ? { ...a, targetPercent: newValue } : a
    ));
  };

  const totalTargetPercent = assets.reduce((sum, a) => sum + a.targetPercent, 0);

  const getAssetValue = (asset) => {
    const price = currency === 'eur' ? asset.priceEur : asset.priceUsd;
    return asset.holdings * (price || 0);
  };

  const getCurrentPercent = (asset) => {
    if (totalValue === 0) return 0;
    return (getAssetValue(asset) / totalValue) * 100;
  };

  const getRebalanceAction = (asset) => {
    const currentValue = getAssetValue(asset);
    const targetValue = (asset.targetPercent / 100) * totalValue;
    const difference = targetValue - currentValue;
    const price = currency === 'eur' ? asset.priceEur : asset.priceUsd;
    
    if (Math.abs(difference) < 1) return null;
    
    return {
      action: difference > 0 ? 'BUY' : 'SELL',
      amount: Math.abs(difference),
      units: price > 0 ? Math.abs(difference / price) : 0,
    };
  };

  const formatCurrency = (num) => {
    return new Intl.NumberFormat(currency === 'eur' ? 'de-DE' : 'en-US', { 
      style: 'currency', 
      currency: currency.toUpperCase(),
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(num);
  };

  const formatNumber = (num, decimals = 6) => {
    if (num >= 1000) return num.toLocaleString(undefined, { maximumFractionDigits: 2 });
    if (num >= 1) return num.toLocaleString(undefined, { maximumFractionDigits: 4 });
    return num.toLocaleString(undefined, { maximumFractionDigits: decimals });
  };

  return (
    <div style={{
      minHeight: '100vh',
      background: '#0b0b0e',
      fontFamily: "'IBM Plex Sans', -apple-system, sans-serif",
      color: '#e8e8ed',
      padding: '32px 20px',
      position: 'relative',
    }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=IBM+Plex+Sans:wght@400;500;600;700&family=IBM+Plex+Mono:wght@400;500&display=swap');
        
        * { box-sizing: border-box; margin: 0; padding: 0; }
        
        .card {
          background: linear-gradient(145deg, #141419 0%, #0f0f12 100%);
          border: 1px solid #1f1f26;
          border-radius: 16px;
        }
        
        .input-field {
          background: #0b0b0e;
          border: 1px solid #2a2a35;
          border-radius: 10px;
          padding: 12px 14px;
          color: #e8e8ed;
          font-size: 14px;
          font-family: 'IBM Plex Mono', monospace;
          width: 100%;
          transition: all 0.2s ease;
          outline: none;
        }
        
        .input-field:focus {
          border-color: #00d4aa;
          box-shadow: 0 0 0 3px rgba(0, 212, 170, 0.1);
        }
        
        .input-field::placeholder {
          color: #4a4a5a;
        }
        
        .btn {
          border: none;
          border-radius: 10px;
          padding: 12px 20px;
          font-weight: 600;
          font-size: 14px;
          cursor: pointer;
          transition: all 0.2s ease;
          font-family: 'IBM Plex Sans', sans-serif;
        }
        
        .btn-primary {
          background: linear-gradient(135deg, #00d4aa 0%, #00b894 100%);
          color: #0b0b0e;
        }
        
        .btn-primary:hover {
          transform: translateY(-2px);
          box-shadow: 0 8px 24px rgba(0, 212, 170, 0.3);
        }
        
        .btn-ghost {
          background: transparent;
          border: 1px solid #2a2a35;
          color: #8a8a9a;
        }
        
        .btn-ghost:hover {
          border-color: #3a3a4a;
          color: #e8e8ed;
        }
        
        .mono {
          font-family: 'IBM Plex Mono', monospace;
        }
        
        .tag {
          display: inline-flex;
          align-items: center;
          padding: 4px 10px;
          border-radius: 6px;
          font-size: 11px;
          font-weight: 600;
          text-transform: uppercase;
          letter-spacing: 0.5px;
        }
        
        .tag-buy {
          background: rgba(0, 212, 170, 0.15);
          color: #00d4aa;
        }
        
        .tag-sell {
          background: rgba(255, 107, 107, 0.15);
          color: #ff6b6b;
        }
        
        .slider {
          -webkit-appearance: none;
          width: 100%;
          height: 6px;
          border-radius: 3px;
          background: #1f1f26;
          outline: none;
        }
        
        .slider::-webkit-slider-thumb {
          -webkit-appearance: none;
          width: 18px;
          height: 18px;
          border-radius: 50%;
          background: #00d4aa;
          cursor: pointer;
          transition: all 0.2s;
        }
        
        .slider::-webkit-slider-thumb:hover {
          transform: scale(1.2);
          box-shadow: 0 0 12px rgba(0, 212, 170, 0.5);
        }
        
        .search-dropdown {
          position: absolute;
          top: 100%;
          left: 0;
          right: 0;
          background: #141419;
          border: 1px solid #2a2a35;
          border-radius: 12px;
          margin-top: 8px;
          max-height: 320px;
          overflow-y: auto;
          z-index: 1000;
          box-shadow: 0 16px 48px rgba(0,0,0,0.5);
        }
        
        .search-item {
          display: flex;
          align-items: center;
          gap: 12px;
          padding: 12px 16px;
          cursor: pointer;
          transition: background 0.15s;
          border-bottom: 1px solid #1f1f26;
        }
        
        .search-item:last-child {
          border-bottom: none;
        }
        
        .search-item:hover {
          background: #1a1a22;
        }
        
        .progress-bar {
          height: 8px;
          background: #1f1f26;
          border-radius: 4px;
          overflow: hidden;
          position: relative;
        }
        
        .progress-fill {
          height: 100%;
          border-radius: 4px;
          transition: width 0.3s ease;
        }
        
        .fade-in {
          animation: fadeIn 0.4s ease forwards;
        }
        
        @keyframes fadeIn {
          from { opacity: 0; transform: translateY(8px); }
          to { opacity: 1; transform: translateY(0); }
        }

        .currency-toggle {
          display: flex;
          background: #141419;
          border-radius: 10px;
          padding: 4px;
          border: 1px solid #1f1f26;
        }

        .currency-btn {
          padding: 8px 16px;
          border: none;
          background: transparent;
          color: #6a6a7a;
          font-weight: 600;
          font-size: 13px;
          cursor: pointer;
          border-radius: 7px;
          transition: all 0.2s;
          font-family: 'IBM Plex Sans', sans-serif;
        }

        .currency-btn.active {
          background: #00d4aa;
          color: #0b0b0e;
        }
      `}</style>
      
      <div style={{ maxWidth: 900, margin: '0 auto' }}>
        {/* Header */}
        <div style={{ marginBottom: 40 }} className="fade-in">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 20 }}>
            <div>
              <h1 style={{ 
                fontSize: 32, 
                fontWeight: 700, 
                marginBottom: 8,
                color: '#fff',
                letterSpacing: '-0.5px'
              }}>
                Portfolio Rebalancer
              </h1>
              <p style={{ color: '#6a6a7a', fontSize: 15 }}>
                Set targets, see what to buy or sell
              </p>
            </div>
            
            <div className="currency-toggle">
              <button 
                className={`currency-btn ${currency === 'eur' ? 'active' : ''}`}
                onClick={() => setCurrency('eur')}
              >
                EUR €
              </button>
              <button 
                className={`currency-btn ${currency === 'usd' ? 'active' : ''}`}
                onClick={() => setCurrency('usd')}
              >
                USD $
              </button>
            </div>
          </div>
        </div>

        {/* Portfolio Summary */}
        <div className="card fade-in" style={{ padding: 28, marginBottom: 24 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 20 }}>
            <div>
              <p style={{ color: '#6a6a7a', fontSize: 13, marginBottom: 6, fontWeight: 500, textTransform: 'uppercase', letterSpacing: '0.5px' }}>Total Portfolio Value</p>
              <p className="mono" style={{ fontSize: 36, fontWeight: 700, color: '#fff' }}>
                {formatCurrency(totalValue)}
              </p>
            </div>
            
            <div style={{ textAlign: 'right' }}>
              <p style={{ color: '#6a6a7a', fontSize: 13, marginBottom: 6, fontWeight: 500, textTransform: 'uppercase', letterSpacing: '0.5px' }}>Target Allocation</p>
              <p className="mono" style={{ 
                fontSize: 28, 
                fontWeight: 700, 
                color: totalTargetPercent === 100 ? '#00d4aa' : totalTargetPercent > 100 ? '#ff6b6b' : '#ffa94d'
              }}>
                {totalTargetPercent.toFixed(1)}%
              </p>
              {totalTargetPercent !== 100 && (
                <p style={{ color: totalTargetPercent > 100 ? '#ff6b6b' : '#ffa94d', fontSize: 12, marginTop: 4 }}>
                  {totalTargetPercent > 100 ? `${(totalTargetPercent - 100).toFixed(1)}% over` : `${(100 - totalTargetPercent).toFixed(1)}% remaining`}
                </p>
              )}
            </div>
          </div>
          
          {/* Overall allocation bar */}
          {assets.length > 0 && (
            <div style={{ marginTop: 24 }}>
              <div style={{ display: 'flex', height: 12, borderRadius: 6, overflow: 'hidden', background: '#1f1f26' }}>
                {assets.map((asset, i) => {
                  const colors = ['#00d4aa', '#00b8d4', '#6c5ce7', '#ff6b6b', '#ffa94d', '#fd79a8', '#a29bfe', '#74b9ff'];
                  return (
                    <div
                      key={asset.id}
                      style={{
                        width: `${getCurrentPercent(asset)}%`,
                        background: colors[i % colors.length],
                        transition: 'width 0.3s ease',
                      }}
                      title={`${asset.symbol}: ${getCurrentPercent(asset).toFixed(1)}%`}
                    />
                  );
                })}
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 16, marginTop: 12 }}>
                {assets.map((asset, i) => {
                  const colors = ['#00d4aa', '#00b8d4', '#6c5ce7', '#ff6b6b', '#ffa94d', '#fd79a8', '#a29bfe', '#74b9ff'];
                  return (
                    <div key={asset.id} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <div style={{ width: 10, height: 10, borderRadius: 3, background: colors[i % colors.length] }} />
                      <span style={{ color: '#8a8a9a', fontSize: 12 }}>{asset.symbol}</span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        {/* Add Asset Button / Search */}
        <div style={{ position: 'relative', marginBottom: 24, zIndex: 50 }} className="fade-in">
          {!showSearch ? (
            <button 
              className="btn btn-primary"
              onClick={() => setShowSearch(true)}
              style={{ width: '100%', padding: 16, fontSize: 15 }}
            >
              + Add Asset
            </button>
          ) : (
            <div style={{ position: 'relative' }}>
              <input
                type="text"
                className="input-field"
                placeholder="Search for a coin (e.g., Bitcoin, Ethereum, Solana...)"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                autoFocus
                style={{ paddingRight: 80 }}
              />
              <button
                className="btn btn-ghost"
                onClick={() => { setShowSearch(false); setSearchQuery(''); setSearchResults([]); }}
                style={{ position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)', padding: '6px 12px' }}
              >
                Cancel
              </button>
              
              {(searchResults.length > 0 || isSearching) && (
                <div className="search-dropdown">
                  {isSearching ? (
                    <div style={{ padding: 20, textAlign: 'center', color: '#6a6a7a' }}>
                      Searching...
                    </div>
                  ) : (
                    searchResults.map(coin => (
                      <div 
                        key={coin.id} 
                        className="search-item"
                        onClick={() => addAsset(coin)}
                      >
                        <img src={coin.thumb} alt={coin.symbol} style={{ width: 32, height: 32, borderRadius: 8 }} />
                        <div style={{ flex: 1 }}>
                          <p style={{ fontWeight: 600, marginBottom: 2 }}>{coin.name}</p>
                          <p style={{ color: '#6a6a7a', fontSize: 13 }}>{coin.symbol.toUpperCase()}</p>
                        </div>
                        {assets.find(a => a.id === coin.id) && (
                          <span style={{ color: '#00d4aa', fontSize: 12 }}>Added</span>
                        )}
                      </div>
                    ))
                  )}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Assets List */}
        {assets.length === 0 ? (
          <div className="card fade-in" style={{ padding: 60, textAlign: 'center' }}>
            <div style={{ fontSize: 48, marginBottom: 16 }}>📊</div>
            <p style={{ color: '#6a6a7a', fontSize: 15, marginBottom: 8 }}>No assets yet</p>
            <p style={{ color: '#4a4a5a', fontSize: 13 }}>Click "Add Asset" to search for coins on CoinGecko</p>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            {assets.map((asset, index) => {
              const rebalance = getRebalanceAction(asset);
              const currentPercent = getCurrentPercent(asset);
              const price = currency === 'eur' ? asset.priceEur : asset.priceUsd;
              const colors = ['#00d4aa', '#00b8d4', '#6c5ce7', '#ff6b6b', '#ffa94d', '#fd79a8', '#a29bfe', '#74b9ff'];
              const assetColor = colors[index % colors.length];
              
              return (
                <div key={asset.id} className="card fade-in" style={{ padding: 24 }}>
                  <div style={{ display: 'flex', gap: 20, flexWrap: 'wrap' }}>
                    {/* Asset Info */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: 14, minWidth: 180 }}>
                      <img src={asset.thumb} alt={asset.symbol} style={{ width: 44, height: 44, borderRadius: 12 }} />
                      <div>
                        <p style={{ fontWeight: 600, fontSize: 16, marginBottom: 2 }}>{asset.symbol}</p>
                        <p className="mono" style={{ color: '#6a6a7a', fontSize: 13 }}>
                          {price > 0 ? formatCurrency(price) : 'Loading...'}
                        </p>
                      </div>
                    </div>
                    
                    {/* Holdings Input */}
                    <div style={{ flex: 1, minWidth: 140 }}>
                      <label style={{ display: 'block', fontSize: 11, color: '#6a6a7a', marginBottom: 6, fontWeight: 500, textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                        Holdings
                      </label>
                      <input
                        type="number"
                        className="input-field"
                        value={asset.holdings || ''}
                        onChange={(e) => updateHoldings(asset.id, e.target.value)}
                        placeholder="0.00"
                        step="any"
                      />
                      <p className="mono" style={{ color: '#4a4a5a', fontSize: 12, marginTop: 6 }}>
                        = {formatCurrency(getAssetValue(asset))}
                      </p>
                    </div>
                    
                    {/* Target Allocation */}
                    <div style={{ flex: 1, minWidth: 180 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                        <label style={{ fontSize: 11, color: '#6a6a7a', fontWeight: 500, textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                          Target
                        </label>
                        <span className="mono" style={{ color: assetColor, fontWeight: 600, fontSize: 14 }}>
                          {asset.targetPercent.toFixed(1)}%
                        </span>
                      </div>
                      <input
                        type="range"
                        className="slider"
                        min="0"
                        max="100"
                        step="0.5"
                        value={asset.targetPercent}
                        onChange={(e) => updateTarget(asset.id, e.target.value)}
                        style={{
                          background: `linear-gradient(to right, ${assetColor} 0%, ${assetColor} ${asset.targetPercent}%, #1f1f26 ${asset.targetPercent}%, #1f1f26 100%)`
                        }}
                      />
                      <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 8 }}>
                        <span style={{ color: '#4a4a5a', fontSize: 11 }}>Current: {currentPercent.toFixed(1)}%</span>
                        <input
                          type="number"
                          className="input-field mono"
                          value={asset.targetPercent}
                          onChange={(e) => updateTarget(asset.id, e.target.value)}
                          style={{ width: 70, padding: '4px 8px', fontSize: 12, textAlign: 'right' }}
                          min="0"
                          max="100"
                          step="0.5"
                        />
                      </div>
                    </div>
                    
                    {/* Rebalance Action */}
                    <div style={{ minWidth: 140, display: 'flex', flexDirection: 'column', alignItems: 'flex-end', justifyContent: 'center' }}>
                      {rebalance ? (
                        <>
                          <span className={`tag ${rebalance.action === 'BUY' ? 'tag-buy' : 'tag-sell'}`}>
                            {rebalance.action}
                          </span>
                          <p className="mono" style={{ 
                            color: rebalance.action === 'BUY' ? '#00d4aa' : '#ff6b6b',
                            fontWeight: 600,
                            fontSize: 15,
                            marginTop: 6,
                          }}>
                            {formatCurrency(rebalance.amount)}
                          </p>
                          <p className="mono" style={{ color: '#6a6a7a', fontSize: 12, marginTop: 2 }}>
                            ≈ {formatNumber(rebalance.units)} {asset.symbol}
                          </p>
                        </>
                      ) : (
                        <span style={{ color: '#4a4a5a', fontSize: 13 }}>Balanced ✓</span>
                      )}
                    </div>
                    
                    {/* Remove Button */}
                    <button
                      onClick={() => removeAsset(asset.id)}
                      style={{
                        background: 'transparent',
                        border: 'none',
                        color: '#4a4a5a',
                        cursor: 'pointer',
                        padding: 8,
                        fontSize: 18,
                        lineHeight: 1,
                        alignSelf: 'flex-start',
                      }}
                      title="Remove asset"
                    >
                      ×
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Rebalancing Summary */}
        {assets.length > 0 && totalTargetPercent === 100 && (
          <div className="card fade-in" style={{ padding: 24, marginTop: 24 }}>
            <h3 style={{ fontSize: 16, fontWeight: 600, marginBottom: 16 }}>Rebalancing Summary</h3>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 16 }}>
              {assets.map(asset => {
                const rebalance = getRebalanceAction(asset);
                if (!rebalance) return null;
                
                return (
                  <div key={asset.id} style={{ 
                    display: 'flex', 
                    alignItems: 'center', 
                    gap: 12,
                    padding: 12,
                    background: rebalance.action === 'BUY' ? 'rgba(0,212,170,0.05)' : 'rgba(255,107,107,0.05)',
                    borderRadius: 10,
                    border: `1px solid ${rebalance.action === 'BUY' ? 'rgba(0,212,170,0.2)' : 'rgba(255,107,107,0.2)'}`
                  }}>
                    <img src={asset.thumb} alt={asset.symbol} style={{ width: 28, height: 28, borderRadius: 6 }} />
                    <div style={{ flex: 1 }}>
                      <p style={{ fontWeight: 500, fontSize: 13 }}>
                        <span style={{ color: rebalance.action === 'BUY' ? '#00d4aa' : '#ff6b6b' }}>
                          {rebalance.action}
                        </span>
                        {' '}{asset.symbol}
                      </p>
                      <p className="mono" style={{ color: '#6a6a7a', fontSize: 12 }}>
                        {formatCurrency(rebalance.amount)}
                      </p>
                    </div>
                  </div>
                );
              }).filter(Boolean)}
              
              {assets.every(a => !getRebalanceAction(a)) && (
                <p style={{ color: '#00d4aa', fontSize: 14 }}>✓ Portfolio is balanced</p>
              )}
            </div>
          </div>
        )}

        {/* Refresh Prices Button */}
        {assets.length > 0 && (
          <div style={{ marginTop: 24, textAlign: 'center' }}>
            <button 
              className="btn btn-ghost"
              onClick={fetchPrices}
              disabled={pricesLoading}
              style={{ opacity: pricesLoading ? 0.5 : 1 }}
            >
              {pricesLoading ? 'Refreshing...' : '↻ Refresh Prices'}
            </button>
            <p style={{ color: '#4a4a5a', fontSize: 11, marginTop: 8 }}>
              Prices from CoinGecko
            </p>
          </div>
        )}

        {/* Footer */}
        <div style={{ textAlign: 'center', marginTop: 48, color: '#3a3a4a', fontSize: 12 }}>
          <p>💡 Set your target allocations to 100% total to see rebalancing actions</p>
        </div>
      </div>
    </div>
  );
};

export default App;
