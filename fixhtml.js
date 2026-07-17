const fs = require('fs');
let html = fs.readFileSync('C:\\Users\\TNKPTP\\SP_Project\\frontend\\index.html', 'utf8');

const newHeaderCenter = `<div class="header-center">
                <div class="header-filters" style="flex-direction: row; flex-wrap: wrap; justify-content: center;">
                    <div class="filter-tabs mover-tabs">
                        <button class="tab-btn mover-btn" data-mover="day_gainers"><i class="ri-rocket-2-line"></i> Gainers</button>
                        <button class="tab-btn mover-btn" data-mover="day_losers"><i class="ri-arrow-down-circle-line"></i> Losers</button>
                        <button class="tab-btn mover-btn" data-mover="most_actives"><i class="ri-fire-line"></i> Active</button>
                        <button class="tab-btn mover-btn" data-mover="trending_now"><i class="ri-pulse-line"></i> Trending</button>
                    </div>
                    <div class="custom-dropdown" id="sector-dropdown">
                        <button class="dropdown-toggle" id="sector-toggle">
                            <span class="dropdown-label" id="sector-label">All Sectors (ทั้งหมด)</span>
                            <i class="ri-arrow-down-s-line"></i>
                        </button>
                        <div class="dropdown-menu" id="sector-menu">
                            <!-- Options populated dynamically -->
                        </div>
                    </div>
                </div>
            </div>`;

html = html.replace(/<div class="header-center">[\s\S]*?<div class="header-search">/, newHeaderCenter + '\n            <div class="header-search">');
fs.writeFileSync('C:\\Users\\TNKPTP\\SP_Project\\frontend\\index.html', html);
console.log("Done");
