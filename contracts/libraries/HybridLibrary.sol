pragma solidity >=0.5.0;

import '@hybridx-exchange/orderbook-core/contracts/libraries/OrderBookLibrary.sol';
import "@hybridx-exchange/orderbook-core/contracts/interfaces/IOrderBook.sol";

library HybridLibrary {
    function getAmountsForBuyLimitOrder(
        address orderBook,
        uint amountOffer,
        uint price,
        uint reserveBase,
        uint reserveQuote)
    internal
    view
    returns (uint[] memory amounts) {
        //获取价格范围内的反方向挂单
        (uint[] memory priceArray, uint[] memory amountArray) =
            IOrderBook(orderBook).rangeBook(OrderBookLibrary.LIMIT_SELL, price);
        uint decimal = IOrderBook(orderBook).priceDecimal();
        uint amountLeft = amountOffer;
        amounts = new uint[](6);

        //看看是否需要吃单
        for (uint i=0; i<priceArray.length; i++) {
            uint amountBaseUsed;
            uint amountQuoteUsed;
            //先计算pair从当前价格到price消耗amountIn的数量
            (amountBaseUsed, amountQuoteUsed, reserveBase, reserveQuote) = OrderBookLibrary.getAmountForMovePrice(
                OrderBookLibrary.LIMIT_BUY, reserveBase, reserveQuote, priceArray[i], decimal);

            //再计算amm中实际会消耗的amountQuote的数量
            amounts[1] += amountQuoteUsed > amountLeft ? amountLeft : amountQuoteUsed;
            //再计算本次移动价格获得的amountBase
            amounts[0] += amountQuoteUsed > amountLeft ? OrderBookLibrary.getAmountOut(amountLeft, reserveQuote,
                reserveBase) : amountBaseUsed;
            //再计算还剩下的amountQuote
            if (amountLeft > amountQuoteUsed) {
                amountLeft = amountLeft - amountQuoteUsed;
            }
            else { //amountIn消耗完了
                amountLeft = 0;
                break;
            }

            //计算消耗掉一个价格的挂单需要的amountQuote数量
            (uint amountInForTake, uint amountOutWithFee, uint fee) = OrderBookLibrary.getAmountOutForTakePrice(
                OrderBookLibrary.LIMIT_BUY, amountLeft, priceArray[i], decimal, amountArray[i]);
            amounts[2] += amountInForTake;
            amounts[3] += amountOutWithFee;
            amounts[4] += fee;
            if (amountLeft > amountInForTake) {
                amountLeft = amountLeft - amountInForTake;
            }
            else{
                amountLeft = 0;
                break;
            }
        }

        if (amounts[1] > 0 && amountLeft > 0) {
            (amountLeft, amounts[1]) =
                OrderBookLibrary.getFixAmountForMovePriceUp(amountLeft, amounts[1], reserveBase, reserveQuote,
                    price, decimal);
        }

        amounts[5] = amountLeft;
    }

    function getAmountsForSellLimitOrder(
        address orderBook,
        uint amountOffer,
        uint price,
        uint reserveBase,
        uint reserveQuote)
    internal
    view
    returns (uint[] memory amounts) {
        //获取价格范围内的反方向挂单
        (uint[] memory priceArray, uint[] memory amountArray) =
            IOrderBook(orderBook).rangeBook(OrderBookLibrary.LIMIT_BUY, price);
        uint decimal = IOrderBook(orderBook).priceDecimal();
        uint amountLeft = amountOffer;
        amounts = new uint[](6);

        //看看是否需要吃单
        for (uint i=0; i<priceArray.length; i++) {
            uint amountBaseUsed;
            uint amountQuoteUsed;
            //先计算pair从当前价格到price消耗amountIn的数量
            (amountBaseUsed, amountQuoteUsed, reserveBase, reserveQuote) = OrderBookLibrary.getAmountForMovePrice(
                OrderBookLibrary.LIMIT_SELL, reserveBase, reserveQuote, priceArray[i], decimal);

            //再计算amm中实际会消耗的amountBase的数量
            amounts[0] += amountBaseUsed > amountLeft ? amountLeft : amountBaseUsed;
            //再计算本次移动价格获得的amountQuote
            amounts[1] += amountBaseUsed > amountLeft ? OrderBookLibrary.getAmountOut(amountLeft, reserveBase,
                reserveQuote) : amountQuoteUsed;
            //再计算还剩下的amountIn
            if (amountLeft > amountBaseUsed) {
                amountLeft = amountLeft - amountBaseUsed;
            }
            else { //amountIn消耗完了
                amountLeft = 0;
                break;
            }

            //计算消耗掉一个价格的挂单需要的amountIn数量
            (uint amountInForTake, uint amountOutWithFee, uint fee) = OrderBookLibrary.getAmountOutForTakePrice(
                OrderBookLibrary.LIMIT_SELL, amountLeft, priceArray[i], decimal, amountArray[i]);
            amounts[2] += amountInForTake;
            amounts[3] += amountOutWithFee;
            amounts[4] += fee;
            if (amountLeft > amountInForTake) {
                amountLeft = amountLeft - amountInForTake;
            }
            else{
                amountLeft = 0;
                break;
            }
        }

        if (amounts[0] > 0 && amountLeft > 0) {
            (amountLeft, amounts[0]) =
            OrderBookLibrary.getFixAmountForMovePriceDown(amountLeft, amounts[0], reserveBase, reserveQuote,
                price, decimal);
        }

        amounts[5] = amountLeft;
    }
}
