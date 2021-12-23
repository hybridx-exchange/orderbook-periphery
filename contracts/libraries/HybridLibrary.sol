pragma solidity >=0.5.0;

import '@hybridx-exchange/orderbook-core/contracts/libraries/OrderBookLibrary.sol';
import "@hybridx-exchange/orderbook-core/contracts/interfaces/IOrderBook.sol";

library HybridLibrary {
    using SafeMath for uint;

    /**************************************************************************************************************
    @param orderBook               address of order book contract
    @param amountOffer             amount offered for limit order
    @param price                   price of limit order
    @param reserveBase             reserve amount of base token
    @param reserveQuote            reserve amount of quote token
    @return amounts                [amm amount in, amm amount out, order amount in, order amount out,
                                    order fee, amount left, price to]
    **************************************************************************************************************/
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
        uint amountInLeft = amountOffer;
        amounts = new uint[](7);

        //看看是否需要吃单
        for (uint i=0; i<priceArray.length; i++) {
            uint amountBaseUsed;
            uint amountQuoteUsed;
            //先计算pair从当前价格到price消耗amountIn的数量
            (amountInLeft, amountBaseUsed, amountQuoteUsed, reserveBase, reserveQuote) =
                OrderBookLibrary.getAmountForMovePrice(
                    OrderBookLibrary.LIMIT_BUY, amountInLeft, reserveBase, reserveQuote, priceArray[i], decimal);

            //再计算amm中实际会消耗的amountQuote的数量
            amounts[0] += amountQuoteUsed;
            //再计算本次移动价格获得的amountBase
            amounts[1] += amountBaseUsed;
            if (amountInLeft == 0) {
                break;
            }

            //计算消耗掉一个价格的挂单需要的amountQuote数量
            (uint amountInForTake, uint amountOutWithFee, uint fee) = OrderBookLibrary.getAmountOutForTakePrice(
                OrderBookLibrary.LIMIT_BUY, amountInLeft, priceArray[i], decimal, amountArray[i]);
            amounts[2] += amountInForTake;
            amounts[3] += amountOutWithFee;
            amounts[4] += fee;
            if (amountInLeft > amountInForTake) {
                amountInLeft = amountInLeft - amountInForTake;
            }
            else {
                amountInLeft = 0;
                break;
            }
        }

        if (amountInLeft > 0 && (priceArray.length == 0 || price > priceArray[priceArray.length-1])) {
            uint amountBaseUsed;
            uint amountQuoteUsed;
            //先计算pair从当前价格到price消耗amountIn的数量
            (amountInLeft, amountBaseUsed, amountQuoteUsed, reserveBase, reserveQuote) =
                OrderBookLibrary.getAmountForMovePrice(
                    OrderBookLibrary.LIMIT_BUY, amountInLeft, reserveBase, reserveQuote, price, decimal);

            //再计算amm中实际会消耗的amountQuote的数量
            amounts[0] += amountQuoteUsed;
            //再计算本次移动价格获得的amountBase
            amounts[1] += amountBaseUsed;
        }

        if (amounts[1] > 0 && amountInLeft > 0) {
            uint amountQuoteFix;
            (amountInLeft, amounts[1], amountQuoteFix) =
                OrderBookLibrary.getFixAmountForMovePriceUp(amountInLeft, amounts[1], reserveBase, reserveQuote,
                    price, decimal);
            amounts[6] = OrderBookLibrary.getPrice(reserveBase, reserveQuote + amountQuoteFix, decimal);
        }
        else {
            amounts[6] = OrderBookLibrary.getPrice(reserveBase, reserveQuote, decimal);
        }

        amounts[5] = amountInLeft;
    }

    //base in quote out
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
        uint amountInLeft = amountOffer;
        amounts = new uint[](7);

        //看看是否需要吃单
        for (uint i=0; i<priceArray.length; i++) {
            uint amountBaseUsed;
            uint amountQuoteUsed;
            (amountInLeft, amountBaseUsed, amountQuoteUsed, reserveBase, reserveQuote) =
                OrderBookLibrary.getAmountForMovePrice(
                OrderBookLibrary.LIMIT_SELL, amountInLeft, reserveBase, reserveQuote, priceArray[i], decimal);
            amounts[0] += amountBaseUsed;
            amounts[1] += amountQuoteUsed;

            //再计算还剩下的amountIn
            if (amountInLeft == 0) {
                break;
            }

            //计算消耗掉一个价格的挂单需要的amountIn数量
            (uint amountInForTake, uint amountOutWithFee, uint fee) = OrderBookLibrary.getAmountOutForTakePrice(
                OrderBookLibrary.LIMIT_SELL, amountInLeft, priceArray[i], decimal, amountArray[i]);
            amounts[2] += amountInForTake;
            amounts[3] += amountOutWithFee;
            amounts[4] += fee;
            if (amountInLeft > amountInForTake) {
                amountInLeft = amountInLeft - amountInForTake;
            }
            else {
                amountInLeft = 0;
                break;
            }
        }

        if (amountInLeft > 0 && (priceArray.length == 0 || price < priceArray[priceArray.length-1])){
            uint amountBaseUsed;
            uint amountQuoteUsed;
            (amountInLeft, amountBaseUsed, amountQuoteUsed, reserveBase, reserveQuote) =
            OrderBookLibrary.getAmountForMovePrice(
                OrderBookLibrary.LIMIT_SELL, amountInLeft, reserveBase, reserveQuote, price, decimal);
            amounts[0] += amountBaseUsed;
            amounts[1] += amountQuoteUsed;
        }

        if (amounts[0] > 0 && amountInLeft > 0) {
            uint amountBaseFix;
            (amountInLeft, amounts[0], amountBaseFix) =
            OrderBookLibrary.getFixAmountForMovePriceDown(amountInLeft, amounts[0], reserveBase, reserveQuote,
                price, decimal);
            amounts[6] = OrderBookLibrary.getPrice(reserveBase + amountBaseFix, reserveQuote, decimal);
        }
        else {
            amounts[6] = OrderBookLibrary.getPrice(reserveBase, reserveQuote, decimal);
        }

        amounts[5] = amountInLeft;
    }
}
