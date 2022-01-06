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

        uint[] memory params = new uint[](5);
        (params[0], params[1], params[2], params[3], params[4]) = (
            IOrderBook(orderBook).priceDecimal(),
            IOrderBook(orderBook).protocolFeeRate(),
            IOrderBook(orderBook).subsidyFeeRate(),
            reserveBase,
            reserveQuote);
        amounts = new uint[](7);
        amounts[5] = amountOffer;

        //看看是否需要吃单
        for (uint i=0; i<priceArray.length; i++) {
            uint amountBaseUsed;
            uint amountQuoteUsed;
            uint amountAmmLeft;
            //先计算pair从当前价格到price消耗amountIn的数量
            (amountAmmLeft, amountBaseUsed, amountQuoteUsed, params[3], params[4]) =
                OrderBookLibrary.getAmountForMovePrice(
                    OrderBookLibrary.LIMIT_BUY, amounts[5], reserveBase, reserveQuote, priceArray[i], params[0]);

            //再计算amm中实际会消耗的amountQuote的数量
            amounts[0] = amountQuoteUsed;
            //再计算本次移动价格获得的amountBase
            amounts[1] = amountBaseUsed;
            if (amountAmmLeft == 0) {
                amounts[5] = 0;  //avoid getAmountForMovePrice recalculation
                break;
            }

            //计算消耗掉一个价格的挂单需要的amountQuote数量
            (uint amountInForTake, uint amountOutWithFee, uint fee) = OrderBookLibrary.getAmountOutForTakePrice(
                OrderBookLibrary.LIMIT_BUY, amountAmmLeft, priceArray[i], params[0], params[1], params[2],
                    amountArray[i]);
            amounts[2] += amountInForTake;
            amounts[3] += amountOutWithFee;
            amounts[4] += fee;
            if (amountInForTake == amountAmmLeft) {
                amounts[5] = 0; //avoid getAmountForMovePrice recalculation
                break;
            }
        }

        if (amounts[5] > 0 && (priceArray.length == 0 || price > priceArray[priceArray.length-1])) {
            uint amountBaseUsed;
            uint amountQuoteUsed;
            //先计算pair从当前价格到price消耗amountIn的数量
            (amounts[5], amountBaseUsed, amountQuoteUsed, params[3], params[4]) =
                OrderBookLibrary.getAmountForMovePrice(
                    OrderBookLibrary.LIMIT_BUY, amounts[5], reserveBase, reserveQuote, price, params[0]);

            //再计算amm中实际会消耗的amountQuote的数量
            amounts[0] = amountQuoteUsed;
            //再计算本次移动价格获得的amountBase
            amounts[1] = amountBaseUsed;
        }

        if (amounts[1] > 0 && amounts[5] > 0) {
            uint amountQuoteFix;
            (amounts[5], amounts[0], amountQuoteFix) =
                OrderBookLibrary.getFixAmountForMovePriceUp(amounts[5], amounts[0], params[3], params[4],
                    price, params[0]);
            amounts[6] = OrderBookLibrary.getPrice(params[3], params[4] + amountQuoteFix, params[0]);
        }
        else {
            amounts[6] = OrderBookLibrary.getPrice(params[3], params[4], params[0]);
        }
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
        uint[] memory params = new uint[](3);
        (params[0], params[1], params[2], params[3], params[4]) = (
            IOrderBook(orderBook).priceDecimal(),
            IOrderBook(orderBook).protocolFeeRate(), //需要获取多个参数，可以考虑一个接口获取多个参数
            IOrderBook(orderBook).subsidyFeeRate(),
            reserveBase,
            reserveQuote);
        amounts = new uint[](7);
        amounts[5] = amountOffer;

        //看看是否需要吃单
        for (uint i=0; i<priceArray.length; i++) {
            uint amountBaseUsed;
            uint amountQuoteUsed;
            uint amountAmmLeft;
            (amountAmmLeft, amountBaseUsed, amountQuoteUsed, params[3], params[4]) =
                OrderBookLibrary.getAmountForMovePrice(
                OrderBookLibrary.LIMIT_SELL, amounts[5], reserveBase, reserveQuote, priceArray[i], params[0]);
            amounts[0] = amountBaseUsed;
            amounts[1] = amountQuoteUsed;

            //再计算还剩下的amountIn
            if (amountAmmLeft == 0) {
                amounts[5] = 0;  //avoid getAmountForMovePrice recalculation
                break;
            }

            //计算消耗掉一个价格的挂单需要的amountIn数量
            (uint amountInForTake, uint amountOutWithFee, uint fee) = OrderBookLibrary.getAmountOutForTakePrice(
                OrderBookLibrary.LIMIT_SELL, amountAmmLeft, priceArray[i], params[0], params[1], params[2],
                    amountArray[i]);
            amounts[2] += amountInForTake;
            amounts[3] += amountOutWithFee;
            amounts[4] += fee;
            amounts[5] = amounts[5].sub(amountInForTake);
            if (amountInForTake == amountAmmLeft) {
                amounts[5] = 0; //avoid getAmountForMovePrice recalculation
                break;
            }
        }

        if (amounts[5] > 0 && (priceArray.length == 0 || price < priceArray[priceArray.length-1])){
            uint amountBaseUsed;
            uint amountQuoteUsed;
            (amounts[5], amountBaseUsed, amountQuoteUsed, params[3], params[4]) =
            OrderBookLibrary.getAmountForMovePrice(
                OrderBookLibrary.LIMIT_SELL, amounts[5], reserveBase, reserveQuote, price, params[0]);
            amounts[0] = amountBaseUsed;
            amounts[1] = amountQuoteUsed;
        }

        if (amounts[0] > 0 && amounts[5] > 0) {
            uint amountBaseFix;
            (amounts[5], amounts[0], amountBaseFix) =
            OrderBookLibrary.getFixAmountForMovePriceDown(amounts[5], amounts[0], params[3], params[4],
                price, params[0]);
            amounts[6] = OrderBookLibrary.getPrice(params[3] + amountBaseFix, params[4], params[0]);
        }
        else {
            amounts[6] = OrderBookLibrary.getPrice(params[3], params[4], params[0]);
        }
    }
}
