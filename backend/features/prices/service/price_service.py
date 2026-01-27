"""
Price Service.
Business logic for price management.
"""
from typing import Any, Dict, Tuple
from datetime import datetime

from common.base.base_service import BaseService
from backend.features.prices.repository.price_repository import PriceRepository
from services.system.logger_service import get_logger, log_error

logger = get_logger(__name__)

class PriceService(BaseService):
    """
    Service for managing product prices.
    Handles business logic, calculations, and orchestration.
    """
    
    def __init__(self, price_repository: PriceRepository):
        super().__init__()
        # Enforce dependency injection as per architectural guidelines
        self.price_repository = price_repository

    def _calculate_month_statistics(self, daily_prices_dict: Dict[str, float]) -> Dict[str, Any]:
        """
        Calculate comprehensive monthly statistics for price history.
        """
        if not daily_prices_dict:
            return {}
        
        prices_array = list(daily_prices_dict.values())
        dates = sorted(daily_prices_dict.keys())
        
        # Basic statistics
        min_price = min(prices_array)
        max_price = max(prices_array)
        avg_price = sum(prices_array) / len(prices_array)
        opening_price = daily_prices_dict[dates[0]]
        closing_price = daily_prices_dict[dates[-1]]
        
        # Volatility calculation (standard deviation percentage)
        variance = sum((price - avg_price) ** 2 for price in prices_array) / len(prices_array)
        volatility = variance ** 0.5
        volatility_percent = (volatility / avg_price) * 100 if avg_price > 0 else 0
        
        # Trend analysis
        total_change = closing_price - opening_price
        total_change_percent = (total_change / opening_price) * 100 if opening_price > 0 else 0
        
        if total_change_percent > 2:
            trend_direction = "upward"
        elif total_change_percent < -2:
            trend_direction = "downward"
        else:
            trend_direction = "stable"
        
        # Best buy day (lowest price)
        min_price_dates = [date for date, price in daily_prices_dict.items() if price == min_price]
        best_buy_day = sorted(min_price_dates)[0]  # Earliest date with minimum price
        
        # Price stability score (0-10, higher = more stable)
        stability_score = max(0, min(10, 10 - volatility_percent))
        
        return {
            "min_price": round(min_price, 2),
            "max_price": round(max_price, 2),
            "avg_price": round(avg_price, 2),
            "opening_price": opening_price,
            "closing_price": closing_price,
            "price_volatility": round(volatility_percent, 2),
            "price_range": round(max_price - min_price, 2),
            "total_change_percent": round(total_change_percent, 2),
            "trend_direction": trend_direction,
            "price_stability_score": round(stability_score, 2),
            "best_buy_day": best_buy_day,
            "days_with_data": len(prices_array)
        }

    def update_price_data(self, supermarket_id: str, product_id: str, new_price: float, price_date: datetime) -> Dict[str, Any]:
        """
        Update both current price and monthly history for a product.
        """
        try:
            # use self.price_repository instead of global
            # 1. Update Current Price
            current_price_data = self.price_repository.update_current_price(
                supermarket_id, product_id, new_price, price_date
            )
            
            # 2. Update Monthly History
            # Get existing document
            existing_doc = self.price_repository.get_monthly_history_doc(supermarket_id, product_id, price_date)
            
            year = price_date.year
            month = price_date.month
            date_str = price_date.strftime('%Y-%m-%d')
            
            if existing_doc:
                data = existing_doc
                if 'daily_prices' not in data:
                    data['daily_prices'] = {}
            else:
                data = {
                    'supermarketId': supermarket_id,
                    'productId': product_id,
                    'year': year,
                    'month': month,
                    'daily_prices': {}
                }
            
            data['daily_prices'][date_str] = new_price
            
            # Calculate updated statistics
            data['month_summary'] = self._calculate_month_statistics(data['daily_prices'])
            data['last_updated'] = datetime.now().isoformat()
            
            # Save
            self.price_repository.save_monthly_history_doc(supermarket_id, product_id, price_date, data)
            
            return {
                "success": True,
                "current_price": current_price_data,
                "history_updated": True
            }
            
        except Exception as e:
            log_error(logger, e, context={"operation": "update_price_data", "product_id": product_id})
            raise e

    def get_current_prices(self, product_id: str) -> Tuple[Dict[str, Any], bool]:
        return self.price_repository.get_current_prices_for_product(product_id)

    def get_price_history(self, supermarket_id: str, product_id: str, months_back: int = 6) -> Tuple[Dict[str, Any], bool]:
        return self.price_repository.get_price_history(supermarket_id, product_id, months_back)

    def get_price_comparison(self, product_id: str) -> Tuple[Dict[str, Any], bool]:
        return self.price_repository.get_price_comparison(product_id)

    def get_price_stats(self) -> Tuple[Dict[str, Any], bool]:
        return self.price_repository.get_price_stats()

    def get_all_current_price_comparisons(self) -> Tuple[Dict[str, Any], bool]:
        return self.price_repository.get_all_current_price_comparisons()

    def update_daily_upload_count(self, date_str: str, supermarket_id: str, new_unique_ids: set) -> Tuple[int, int]:
        return self.price_repository.update_daily_upload_count(date_str, supermarket_id, new_unique_ids)

    def get_daily_upload_counts(self, start_date: datetime, end_date: datetime) -> Dict[str, int]:
        return self.price_repository.get_daily_upload_counts(start_date, end_date)

    def get_product_price_history(self, product_id: str) -> Tuple[Dict[str, Any], bool]:
        return self.price_repository.get_product_price_history(product_id)

    def get_enhanced_overview(self, page: int, per_page: int, category_filter: str = '', supermarket_filter: str = '') -> Tuple[Dict[str, Any], bool]:
        return self.price_repository.get_enhanced_overview(page, per_page, category_filter, supermarket_filter)

    def invalidate_all_price_views(self) -> None:
        self.price_repository.invalidate_all_price_views()

    def invalidate_cache_for_upload(self, product_ids: set) -> None:
        """Invalidate caches after bulk upload."""
        for pid in product_ids:
            if hasattr(self.price_repository, 'invalidate_product_prices'):
                self.price_repository.invalidate_product_prices(pid)
        
        if hasattr(self.price_repository, 'invalidate_overview'):
            self.price_repository.invalidate_overview()
            
        if hasattr(self.price_repository, 'invalidate_stats'):
            self.price_repository.invalidate_stats()
