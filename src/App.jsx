import { useState, useEffect, useCallback } from 'react';

const App = () => {
  // Load saved data from localStorage on startup
  const [assets, setAssets] = useState(() => {
    try {
      const saved = localStorage.getItem('portfolio-assets-v2');
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });
  const [currency, setCurrency] = useState(() => {
    try {
      return localStorage.getItem('portfolio-currency') || 'eur';
    } catch {
      return 'eur';
    }
  });
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [isSearching, setIsSearching] = useState(false);
  const [showSearch, setShowSearch] = useState(false);
  const [totalValue, setTotalValue] = useState(0);
  const [pricesLoading, setPricesLoading] = useState(false);

  const currencySymbol = currency === 'eur' ? '€' : '$';

  // Save assets to localStorage whenever they change
  useEffect(() => {
    try {
      localStorage.setItem('portfolio-assets-v2', JSON.stringify(assets));
    } catch (error) {
      console.error('Failed to save assets:', error);
    }
  }, [assets]);

  // Save currency preference to localStorage
  useEffect(() => {
    try {
      localStorage.setItem('portfolio-currency', currency);
    } catch (error) {
      console.error('Failed to save currency:', error);
    }
  }, [currency]);

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
        `https://api.coingecko.com/api/v3/simple/price?ids=${ids}&vs_currencies=eur,usd&include_24hr_change=true`
      );
      const data = await response.json();
      
      setAssets(prev => prev.map(asset => ({
        ...asset,
        priceEur: data[asset.id]?.eur || asset.priceEur || 0,
        priceUsd: data[asset.id]?.usd || asset.priceUsd || 0,
        change24h: data[asset.id]?.eur_24h_change || 0,
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

  // Sort assets by value (highest first)
  const sortedAssets = [...assets].sort((a, b) => {
    const priceA = currency === 'eur' ? a.priceEur : a.priceUsd;
    const priceB = currency === 'eur' ? b.priceEur : b.priceUsd;
    return (b.holdings * (priceB || 0)) - (a.holdings * (priceA || 0));
  });

  // Category helpers
  const safeAssets = sortedAssets.filter(a => a.category === 'safe');
  const riskyAssets = sortedAssets.filter(a => a.category === 'risky');
  const uncategorized = sortedAssets.filter(a => !a.category);

  const getCategoryValue = (categoryAssets) => {
    return categoryAssets.reduce((sum, asset) => {
      const price = currency === 'eur' ? asset.priceEur : asset.priceUsd;
      return sum + (asset.holdings * (price || 0));
    }, 0);
  };

  const getCategoryTarget = (categoryAssets) => {
    return categoryAssets.reduce((sum, a) => sum + (a.targetPercent || 0), 0);
  };

  // Calculate total P&L
  const totalPnL = assets.reduce((sum, asset) => {
    const price = currency === 'eur' ? asset.priceEur : asset.priceUsd;
    const currentValue = asset.holdings * (price || 0);
    const costBasis = asset.holdings * (asset.buyPrice || 0);
    return sum + (currentValue - costBasis);
  }, 0);

  const totalCostBasis = assets.reduce((sum, asset) => {
    return sum + (asset.holdings * (asset.buyPrice || 0));
  }, 0);

  const pnlPercent = totalCostBasis > 0 ? (totalPnL / totalCostBasis) * 100 : 0;

  // Allocation health score
  const calculateHealthScore = () => {
    if (assets.length === 0 || totalValue === 0) return 100;
    
    const totalDeviation = assets.reduce((sum, asset) => {
      const currentPercent = (getAssetValue(asset) / totalValue) * 100;
      const targetPercent = asset.targetPercent || 0;
      return sum + Math.abs(currentPercent - targetPercent);
    }, 0);
    
    // Max deviation would be 200 (everything wrong), so normalize
    const score = Math.max(0, 100 - (totalDeviation / 2));
    return Math.round(score);
  };

  const healthScore = calculateHealthScore();

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
      buyPrice: 0,
      category: null,
      priceEur: 0,
      priceUsd: 0,
      change24h: 0,
    };

    setAssets([...assets, newAsset]);
    setShowSearch(false);
    setSearchQuery('');
    setSearchResults([]);

    // Fetch price for new asset
    setTimeout(async () => {
      try {
        const response = await fetch(
          `https://api.coingecko.com/api/v3/simple/price?ids=${coin.id}&vs_currencies=eur,usd&include_24hr_change=true`
        );
        const data = await response.json();
        
        setAssets(prev => prev.map(asset => 
          asset.id === coin.id 
            ? { 
                ...asset, 
                priceEur: data[coin.id]?.eur || 0, 
                priceUsd: data[coin.id]?.usd || 0,
                change24h: data[coin.id]?.eur_24h_change || 0,
              }
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

  const updateAsset = (id, field, value) => {
    setAssets(assets.map(a => 
      a.id === id ? { ...a, [field]: field === 'category' ? value : (parseFloat(value) || 0) } : a
    ));
  };

  const totalTargetPercent = assets.reduce((sum, a) => sum + (a.targetPercent || 0), 0);

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
    const targetValue = ((asset.targetPercent || 0) / 100) * totalValue;
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

  // Export to CSV
  const exportToCSV = () => {
    const headers = ['Symbol', 'Name', 'Category', 'Holdings', 'Buy Price', 'Current Price', 'Value', 'P&L', 'Current %', 'Target %', 'Action'];
    const rows = sortedAssets.map(asset => {
      const price = currency === 'eur' ? asset.priceEur : asset.priceUsd;
      const value = getAssetValue(asset);
      const pnl = value - (asset.holdings * (asset.buyPrice || 0));
      const rebalance = getRebalanceAction(asset);
      
      return [
        asset.symbol,
        asset.name,
        asset.category || 'uncategorized',
        asset.holdings,
        asset.buyPrice || 0,
        price,
        value.toFixed(2),
        pnl.toFixed(2),
        getCurrentPercent(asset).toFixed(2) + '%',
        (asset.targetPercent || 0).toFixed(2) + '%',
        rebalance ? `${rebalance.action} ${formatCurrency(rebalance.amount)}` : 'Balanced'
      ];
    });

    const csvContent = [headers, ...rows].map(row => row.join(',')).join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `portfolio-${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  // Pie Chart Component
  const PieChart = ({ data, title, size = 160 }) => {
    if (data.length === 0) return null;
    
    const total = data.reduce((sum, d) => sum + d.value, 0);
    if (total === 0) return null;

    let currentAngle = -90;
    const segments = data.map((d, i) => {
      const percentage = (d.value / total) * 100;
      const angle = (percentage / 100) * 360;
      const startAngle = currentAngle;
      currentAngle += angle;
      
      const startRad = (startAngle * Math.PI) / 180;
      const endRad = ((startAngle + angle) * Math.PI) / 180;
      
      const x1 = 50 + 40 * Math.cos(startRad);
      const y1 = 50 + 40 * Math.sin(startRad);
      const x2 = 50 + 40 * Math.cos(endRad);
      const y2 = 50 + 40 * Math.sin(endRad);
      
      const largeArc = angle > 180 ? 1 : 0;
      
      return {
        ...d,
        percentage,
        path: percentage >= 99.9 
          ? `M 50 10 A 40 40 0 1 1 49.99 10 Z`
          : `M 50 50 L ${x1} ${y1} A 40 40 0 ${largeArc} 1 ${x2} ${y2} Z`
      };
    });

    return (
      <div style={{ textAlign: 'center' }}>
        <p style={{ color: '#9a9aaa', fontSize: 11, marginBottom: 12, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '1px' }}>{title}</p>
        <svg width={size} height={size} viewBox="0 0 100 100" style={{ filter: 'drop-shadow(0 4px 12px rgba(0,0,0,0.3))' }}>
          {segments.map((seg, i) => (
            <path
              key={i}
              d={seg.path}
              fill={seg.color}
              stroke="#1a1a24"
              strokeWidth="1"
            />
          ))}
          <circle cx="50" cy="50" r="22" fill="#1a1a24" />
        </svg>
        <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'center', gap: 8, marginTop: 12 }}>
          {segments.filter(s => s.percentage > 0).slice(0, 6).map((seg, i) => (
            <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
              <div style={{ width: 8, height: 8, borderRadius: 2, background: seg.color }} />
              <span style={{ color: '#7a7a8a', fontSize: 10 }}>{seg.label}</span>
            </div>
          ))}
        </div>
      </div>
    );
  };

  const colors = ['#E84A9C', '#F5D547', '#5B9A6F', '#00b8d4', '#9C6ADE', '#ff6b6b', '#ffa94d', '#74b9ff'];
  
  const currentAllocationData = sortedAssets.filter(a => getAssetValue(a) > 0).map((asset, i) => ({
    label: asset.symbol,
    value: getAssetValue(asset),
    color: colors[i % colors.length],
  }));

  const targetAllocationData = sortedAssets.filter(a => (a.targetPercent || 0) > 0).map((asset, i) => ({
    label: asset.symbol,
    value: asset.targetPercent || 0,
    color: colors[sortedAssets.findIndex(a => a.id === asset.id) % colors.length],
  }));

  // Render asset card
  const renderAssetCard = (asset, index) => {
    const rebalance = getRebalanceAction(asset);
    const currentPercent = getCurrentPercent(asset);
    const price = currency === 'eur' ? asset.priceEur : asset.priceUsd;
    const assetColor = colors[sortedAssets.findIndex(a => a.id === asset.id) % colors.length];
    const assetPnL = getAssetValue(asset) - (asset.holdings * (asset.buyPrice || 0));
    
    return (
      <div key={asset.id} className="card fade-in" style={{ padding: 20 }}>
        <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', alignItems: 'center' }}>
          {/* Asset Info */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, minWidth: 140 }}>
            <img src={asset.thumb} alt={asset.symbol} style={{ width: 40, height: 40, borderRadius: 10 }} />
            <div>
              <p style={{ fontWeight: 600, fontSize: 15, marginBottom: 2 }}>{asset.symbol}</p>
              <p className="mono" style={{ color: '#7a7a8a', fontSize: 12 }}>
                {price > 0 ? formatCurrency(price) : '...'}
              </p>
            </div>
          </div>
          
          {/* Category Toggle */}
          <div style={{ minWidth: 100 }}>
            <div style={{ display: 'flex', gap: 4 }}>
              <button
                onClick={() => updateAsset(asset.id, 'category', asset.category === 'safe' ? null : 'safe')}
                style={{
                  padding: '4px 8px',
                  fontSize: 10,
                  fontWeight: 600,
                  border: 'none',
                  borderRadius: 4,
                  cursor: 'pointer',
                  background: asset.category === 'safe' ? '#5B9A6F' : '#2a2a35',
                  color: asset.category === 'safe' ? '#fff' : '#6a6a7a',
                }}
              >
                SAFE
              </button>
              <button
                onClick={() => updateAsset(asset.id, 'category', asset.category === 'risky' ? null : 'risky')}
                style={{
                  padding: '4px 8px',
                  fontSize: 10,
                  fontWeight: 600,
                  border: 'none',
                  borderRadius: 4,
                  cursor: 'pointer',
                  background: asset.category === 'risky' ? '#E84A9C' : '#2a2a35',
                  color: asset.category === 'risky' ? '#fff' : '#6a6a7a',
                }}
              >
                RISKY
              </button>
            </div>
          </div>
          
          {/* Holdings */}
          <div style={{ flex: 1, minWidth: 100 }}>
            <label style={{ display: 'block', fontSize: 10, color: '#6a6a7a', marginBottom: 4, fontWeight: 500 }}>HOLDINGS</label>
            <input
              type="number"
              className="input-field"
              value={asset.holdings || ''}
              onChange={(e) => updateAsset(asset.id, 'holdings', e.target.value)}
              placeholder="0"
              step="any"
              style={{ padding: '8px 10px', fontSize: 13 }}
            />
            <p className="mono" style={{ color: '#5a5a6a', fontSize: 11, marginTop: 4 }}>
              = {formatCurrency(getAssetValue(asset))}
            </p>
          </div>
          
          {/* Buy Price */}
          <div style={{ flex: 1, minWidth: 90 }}>
            <label style={{ display: 'block', fontSize: 10, color: '#6a6a7a', marginBottom: 4, fontWeight: 500 }}>BUY PRICE</label>
            <input
              type="number"
              className="input-field"
              value={asset.buyPrice || ''}
              onChange={(e) => updateAsset(asset.id, 'buyPrice', e.target.value)}
              placeholder="0"
              step="any"
              style={{ padding: '8px 10px', fontSize: 13 }}
            />
            <p className="mono" style={{ 
              color: assetPnL >= 0 ? '#5B9A6F' : '#E84A9C', 
              fontSize: 11, 
              marginTop: 4,
              fontWeight: 500,
            }}>
              {assetPnL >= 0 ? '+' : ''}{formatCurrency(assetPnL)}
            </p>
          </div>
          
          {/* Target */}
          <div style={{ flex: 1, minWidth: 120 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
              <label style={{ fontSize: 10, color: '#6a6a7a', fontWeight: 500 }}>TARGET</label>
              <span className="mono" style={{ color: assetColor, fontWeight: 600, fontSize: 12 }}>
                {(asset.targetPercent || 0).toFixed(1)}%
              </span>
            </div>
            <input
              type="range"
              className="slider"
              min="0"
              max="100"
              step="0.5"
              value={asset.targetPercent || 0}
              onChange={(e) => updateAsset(asset.id, 'targetPercent', e.target.value)}
              style={{
                background: `linear-gradient(to right, ${assetColor} 0%, ${assetColor} ${asset.targetPercent || 0}%, #2a2a35 ${asset.targetPercent || 0}%, #2a2a35 100%)`
              }}
            />
            <p style={{ color: '#5a5a6a', fontSize: 10, marginTop: 4 }}>
              Now: {currentPercent.toFixed(1)}%
            </p>
          </div>
          
          {/* Action */}
          <div style={{ minWidth: 100, textAlign: 'right' }}>
            {rebalance ? (
              <>
                <span className={`tag ${rebalance.action === 'BUY' ? 'tag-buy' : 'tag-sell'}`}>
                  {rebalance.action}
                </span>
                <p className="mono" style={{ 
                  color: rebalance.action === 'BUY' ? '#5B9A6F' : '#E84A9C',
                  fontWeight: 600,
                  fontSize: 13,
                  marginTop: 4,
                }}>
                  {formatCurrency(rebalance.amount)}
                </p>
              </>
            ) : (
              <span style={{ color: '#5a5a6a', fontSize: 12 }}>Balanced ✓</span>
            )}
          </div>
          
          {/* Remove */}
          <button
            onClick={() => removeAsset(asset.id)}
            style={{
              background: 'transparent',
              border: 'none',
              color: '#4a4a5a',
              cursor: 'pointer',
              padding: 4,
              fontSize: 18,
              lineHeight: 1,
            }}
          >
            ×
          </button>
        </div>
      </div>
    );
  };

  return (
    <div style={{
      minHeight: '100vh',
      background: 'linear-gradient(180deg, #12121a 0%, #1a1a24 100%)',
      fontFamily: "'IBM Plex Sans', -apple-system, sans-serif",
      color: '#e8e8ed',
      padding: '32px 20px',
    }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=IBM+Plex+Sans:wght@400;500;600;700&family=IBM+Plex+Mono:wght@400;500&display=swap');
        
        * { box-sizing: border-box; margin: 0; padding: 0; }
        
        .card {
          background: linear-gradient(145deg, #1e1e28 0%, #16161e 100%);
          border: 1px solid #2a2a35;
          border-radius: 16px;
        }
        
        .card-pink {
          background: linear-gradient(145deg, #2d1f2d 0%, #1e161e 100%);
          border: 1px solid #3d2a3d;
        }
        
        .card-green {
          background: linear-gradient(145deg, #1f2d22 0%, #161e18 100%);
          border: 1px solid #2a3d2d;
        }
        
        .input-field {
          background: #12121a;
          border: 1px solid #3a3a45;
          border-radius: 8px;
          padding: 10px 12px;
          color: #e8e8ed;
          font-size: 14px;
          font-family: 'IBM Plex Mono', monospace;
          width: 100%;
          transition: all 0.2s ease;
          outline: none;
        }
        
        .input-field:focus {
          border-color: #E84A9C;
          box-shadow: 0 0 0 3px rgba(232, 74, 156, 0.15);
        }
        
        .input-field::placeholder { color: #4a4a5a; }
        
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
          background: linear-gradient(135deg, #E84A9C 0%, #D43D8C 100%);
          color: white;
        }
        
        .btn-primary:hover {
          transform: translateY(-2px);
          box-shadow: 0 8px 24px rgba(232, 74, 156, 0.4);
        }
        
        .btn-secondary {
          background: linear-gradient(135deg, #F5D547 0%, #E5C537 100%);
          color: #1a1a24;
        }
        
        .btn-secondary:hover {
          transform: translateY(-2px);
          box-shadow: 0 8px 24px rgba(245, 213, 71, 0.3);
        }
        
        .btn-ghost {
          background: transparent;
          border: 1px solid #3a3a45;
          color: #9a9aaa;
        }
        
        .btn-ghost:hover {
          border-color: #E84A9C;
          color: #E84A9C;
        }
        
        .mono { font-family: 'IBM Plex Mono', monospace; }
        
        .tag {
          display: inline-block;
          padding: 4px 10px;
          border-radius: 6px;
          font-size: 10px;
          font-weight: 700;
          text-transform: uppercase;
          letter-spacing: 0.5px;
        }
        
        .tag-buy {
          background: rgba(91, 154, 111, 0.2);
          color: #5B9A6F;
        }
        
        .tag-sell {
          background: rgba(232, 74, 156, 0.2);
          color: #E84A9C;
        }
        
        .slider {
          -webkit-appearance: none;
          width: 100%;
          height: 6px;
          border-radius: 3px;
          background: #2a2a35;
          outline: none;
        }
        
        .slider::-webkit-slider-thumb {
          -webkit-appearance: none;
          width: 16px;
          height: 16px;
          border-radius: 50%;
          background: #F5D547;
          cursor: pointer;
          box-shadow: 0 2px 8px rgba(245, 213, 71, 0.4);
        }
        
        .search-dropdown {
          position: absolute;
          top: 100%;
          left: 0;
          right: 0;
          background: #1e1e28;
          border: 1px solid #3a3a45;
          border-radius: 12px;
          margin-top: 8px;
          max-height: 300px;
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
          border-bottom: 1px solid #2a2a35;
        }
        
        .search-item:hover { background: #2a2a35; }
        
        .fade-in {
          animation: fadeIn 0.4s ease forwards;
        }
        
        @keyframes fadeIn {
          from { opacity: 0; transform: translateY(8px); }
          to { opacity: 1; transform: translateY(0); }
        }

        .currency-toggle {
          display: flex;
          background: #1e1e28;
          border-radius: 8px;
          padding: 3px;
          border: 1px solid #2a2a35;
        }

        .currency-btn {
          padding: 6px 14px;
          border: none;
          background: transparent;
          color: #6a6a7a;
          font-weight: 600;
          font-size: 12px;
          cursor: pointer;
          border-radius: 6px;
          transition: all 0.2s;
          font-family: 'IBM Plex Sans', sans-serif;
        }

        .currency-btn.active {
          background: #E84A9C;
          color: white;
        }
        
        .health-ring {
          position: relative;
          width: 80px;
          height: 80px;
        }
        
        .health-ring svg {
          transform: rotate(-90deg);
        }
        
        .health-value {
          position: absolute;
          inset: 0;
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 20px;
          font-weight: 700;
        }
      `}</style>
      
      <div style={{ maxWidth: 1000, margin: '0 auto' }}>
        {/* Header */}
        <div style={{ marginBottom: 32 }} className="fade-in">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 16 }}>
            <div>
              <h1 style={{ 
                fontSize: 28, 
                fontWeight: 700, 
                marginBottom: 4,
                background: 'linear-gradient(135deg, #E84A9C 0%, #F5D547 100%)',
                WebkitBackgroundClip: 'text',
                WebkitTextFillColor: 'transparent',
              }}>
                Portfolio Rebalancer
              </h1>
              <p style={{ color: '#6a6a7a', fontSize: 13 }}>
                Track, balance & optimize your crypto
              </p>
            </div>
            
            <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
              <button className="btn btn-ghost" onClick={exportToCSV} style={{ padding: '8px 14px', fontSize: 12 }}>
                📊 Export CSV
              </button>
              <div className="currency-toggle">
                <button 
                  className={`currency-btn ${currency === 'eur' ? 'active' : ''}`}
                  onClick={() => setCurrency('eur')}
                >
                  EUR
                </button>
                <button 
                  className={`currency-btn ${currency === 'usd' ? 'active' : ''}`}
                  onClick={() => setCurrency('usd')}
                >
                  USD
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* Stats Row */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 16, marginBottom: 24 }}>
          {/* Total Value */}
          <div className="card fade-in" style={{ padding: 20 }}>
            <p style={{ color: '#7a7a8a', fontSize: 11, marginBottom: 6, fontWeight: 500, textTransform: 'uppercase', letterSpacing: '0.5px' }}>Portfolio Value</p>
            <p className="mono" style={{ fontSize: 26, fontWeight: 700, color: '#fff' }}>
              {formatCurrency(totalValue)}
            </p>
          </div>
          
          {/* P&L */}
          <div className={`card fade-in ${totalPnL >= 0 ? 'card-green' : 'card-pink'}`} style={{ padding: 20 }}>
            <p style={{ color: '#7a7a8a', fontSize: 11, marginBottom: 6, fontWeight: 500, textTransform: 'uppercase', letterSpacing: '0.5px' }}>Total P&L</p>
            <p className="mono" style={{ fontSize: 26, fontWeight: 700, color: totalPnL >= 0 ? '#5B9A6F' : '#E84A9C' }}>
              {totalPnL >= 0 ? '+' : ''}{formatCurrency(totalPnL)}
            </p>
            <p style={{ color: totalPnL >= 0 ? '#5B9A6F' : '#E84A9C', fontSize: 12, marginTop: 4 }}>
              {pnlPercent >= 0 ? '+' : ''}{pnlPercent.toFixed(2)}%
            </p>
          </div>
          
          {/* Health Score */}
          <div className="card fade-in" style={{ padding: 20, display: 'flex', alignItems: 'center', gap: 16 }}>
            <div className="health-ring">
              <svg width="80" height="80" viewBox="0 0 80 80">
                <circle cx="40" cy="40" r="34" fill="none" stroke="#2a2a35" strokeWidth="6" />
                <circle 
                  cx="40" cy="40" r="34" fill="none" 
                  stroke={healthScore >= 80 ? '#5B9A6F' : healthScore >= 50 ? '#F5D547' : '#E84A9C'}
                  strokeWidth="6" 
                  strokeLinecap="round"
                  strokeDasharray={`${(healthScore / 100) * 213.6} 213.6`}
                />
              </svg>
              <div className="health-value" style={{ color: healthScore >= 80 ? '#5B9A6F' : healthScore >= 50 ? '#F5D547' : '#E84A9C' }}>
                {healthScore}
              </div>
            </div>
            <div>
              <p style={{ color: '#7a7a8a', fontSize: 11, fontWeight: 500, textTransform: 'uppercase', letterSpacing: '0.5px' }}>Health Score</p>
              <p style={{ color: '#9a9aaa', fontSize: 12, marginTop: 4 }}>
                {healthScore >= 80 ? 'Well balanced' : healthScore >= 50 ? 'Needs attention' : 'Rebalance needed'}
              </p>
            </div>
          </div>
          
          {/* Target Status */}
          <div className="card fade-in" style={{ padding: 20 }}>
            <p style={{ color: '#7a7a8a', fontSize: 11, marginBottom: 6, fontWeight: 500, textTransform: 'uppercase', letterSpacing: '0.5px' }}>Target Allocation</p>
            <p className="mono" style={{ 
              fontSize: 26, 
              fontWeight: 700, 
              color: totalTargetPercent === 100 ? '#5B9A6F' : totalTargetPercent > 100 ? '#E84A9C' : '#F5D547'
            }}>
              {totalTargetPercent.toFixed(0)}%
            </p>
            {totalTargetPercent !== 100 && (
              <p style={{ color: '#F5D547', fontSize: 12, marginTop: 4 }}>
                {totalTargetPercent > 100 ? 'Over allocated!' : `${(100 - totalTargetPercent).toFixed(0)}% to assign`}
              </p>
            )}
          </div>
        </div>

        {/* Pie Charts */}
        {assets.length > 0 && (
          <div className="card fade-in" style={{ padding: 24, marginBottom: 24 }}>
            <div style={{ display: 'flex', justifyContent: 'space-around', flexWrap: 'wrap', gap: 32 }}>
              <PieChart data={currentAllocationData} title="Current Allocation" size={140} />
              <PieChart data={targetAllocationData} title="Target Allocation" size={140} />
            </div>
          </div>
        )}

        {/* Category Summaries */}
        {(safeAssets.length > 0 || riskyAssets.length > 0) && (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 16, marginBottom: 24 }}>
            {safeAssets.length > 0 && (
              <div className="card card-green fade-in" style={{ padding: 16 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                  <span style={{ fontSize: 16 }}>🛡️</span>
                  <span style={{ color: '#5B9A6F', fontWeight: 600, fontSize: 13 }}>SAFE ASSETS</span>
                </div>
                <p className="mono" style={{ fontSize: 20, fontWeight: 700, color: '#fff' }}>
                  {formatCurrency(getCategoryValue(safeAssets))}
                </p>
                <p style={{ color: '#6a6a7a', fontSize: 11, marginTop: 4 }}>
                  {totalValue > 0 ? ((getCategoryValue(safeAssets) / totalValue) * 100).toFixed(1) : 0}% of portfolio • Target: {getCategoryTarget(safeAssets).toFixed(0)}%
                </p>
              </div>
            )}
            {riskyAssets.length > 0 && (
              <div className="card card-pink fade-in" style={{ padding: 16 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                  <span style={{ fontSize: 16 }}>🚀</span>
                  <span style={{ color: '#E84A9C', fontWeight: 600, fontSize: 13 }}>RISKY ASSETS</span>
                </div>
                <p className="mono" style={{ fontSize: 20, fontWeight: 700, color: '#fff' }}>
                  {formatCurrency(getCategoryValue(riskyAssets))}
                </p>
                <p style={{ color: '#6a6a7a', fontSize: 11, marginTop: 4 }}>
                  {totalValue > 0 ? ((getCategoryValue(riskyAssets) / totalValue) * 100).toFixed(1) : 0}% of portfolio • Target: {getCategoryTarget(riskyAssets).toFixed(0)}%
                </p>
              </div>
            )}
          </div>
        )}

        {/* Add Asset */}
        <div style={{ position: 'relative', marginBottom: 24, zIndex: 50 }} className="fade-in">
          {!showSearch ? (
            <button 
              className="btn btn-primary"
              onClick={() => setShowSearch(true)}
              style={{ width: '100%', padding: 14 }}
            >
              + Add Asset
            </button>
          ) : (
            <div style={{ position: 'relative' }}>
              <input
                type="text"
                className="input-field"
                placeholder="Search for a coin..."
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
                    <div style={{ padding: 20, textAlign: 'center', color: '#6a6a7a' }}>Searching...</div>
                  ) : (
                    searchResults.map(coin => (
                      <div key={coin.id} className="search-item" onClick={() => addAsset(coin)}>
                        <img src={coin.thumb} alt={coin.symbol} style={{ width: 32, height: 32, borderRadius: 8 }} />
                        <div style={{ flex: 1 }}>
                          <p style={{ fontWeight: 600, marginBottom: 2 }}>{coin.name}</p>
                          <p style={{ color: '#6a6a7a', fontSize: 12 }}>{coin.symbol.toUpperCase()}</p>
                        </div>
                        {assets.find(a => a.id === coin.id) && (
                          <span style={{ color: '#5B9A6F', fontSize: 11 }}>Added</span>
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
        {sortedAssets.length === 0 ? (
          <div className="card fade-in" style={{ padding: 60, textAlign: 'center' }}>
            <div style={{ fontSize: 48, marginBottom: 16 }}>🐧</div>
            <p style={{ color: '#7a7a8a', fontSize: 15 }}>Add your first asset to get started</p>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {sortedAssets.map((asset, index) => renderAssetCard(asset, index))}
          </div>
        )}

        {/* Refresh */}
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
            <p style={{ color: '#4a4a5a', fontSize: 10, marginTop: 6 }}>
              Prices from CoinGecko
            </p>
          </div>
        )}

        {/* Footer */}
        <div style={{ textAlign: 'center', marginTop: 40, color: '#3a3a4a', fontSize: 11 }}>
          <p>Set targets to 100% to see rebalancing actions 🎯</p>
        </div>
      </div>
    </div>
  );
};

export default App;
