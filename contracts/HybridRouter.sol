/**
 *Submitted for verification at Etherscan.io on 2020-06-05
*/

pragma solidity =0.6.6;

import '@uniswap/lib/contracts/libraries/TransferHelper.sol';
import '@hybridx-exchange/orderbook-core/contracts/libraries/OrderBookLibrary.sol';
import "@hybridx-exchange/orderbook-core/contracts/interfaces/IWETH.sol";
import "@hybridx-exchange/orderbook-core/contracts/interfaces/IOrderBook.sol";
import "@hybridx-exchange/orderbook-core/contracts/interfaces/IOrderBookFactory.sol";
import "./interfaces/IHybridRouter.sol";

contract HybridRouter is IHybridRouter {
    address public immutable override factory;
    address public immutable override WETH;

    modifier ensure(uint deadline) {
        require(deadline >= block.timestamp, 'HybridRouter: EXPIRED');
        _;
    }

    constructor(address _factory, address _WETH) public {
        factory = _factory;
        WETH = _WETH;
    }

    receive() external payable {
        assert(msg.sender == WETH); // only accept ETH via fallback from the WETH contract
    }

    //创建用quoteToken买baseToken限价单 (usdc -> uni)
    function buyWithToken(
        uint amountOffer,
        uint price,
        address baseToken,
        address quoteToken,
        address to,
        uint deadline)
        external
        virtual
        override
        ensure(deadline)
        returns (uint orderId) {
        require(baseToken != quoteToken, 'HybridRouter: Invalid_Path');
        address orderBook = IOrderBookFactory(factory).getOrderBook(baseToken, quoteToken);
        require(orderBook != address(0), 'HybridRouter: Invalid_OrderBook');
        require(baseToken == IOrderBook(orderBook).baseToken(), 'HybridRouter: MisOrder_Path');

        TransferHelper.safeTransferFrom(
            quoteToken, msg.sender, orderBook, amountOffer
        );

        to = to == address(0) ? msg.sender : to;
        orderId = IOrderBook(orderBook).createBuyLimitOrder(msg.sender, price, to);
    }

    //创建用ETH买BaseToken限价单 (eth -> uni)
    function buyWithEth(
        uint price,
        address baseToken,
        address quoteToken,
        address to,
        uint deadline)
        external
        virtual
        payable
        override
        ensure(deadline)
        returns (uint orderId)
    {
        require(baseToken != quoteToken, 'HybridRouter: Invalid_Path');
        require(quoteToken == WETH, 'HybirdRouter: Invalid_Token');
        address orderBook = IOrderBookFactory(factory).getOrderBook(baseToken, WETH);
        require(orderBook != address(0), 'HybridRouter: Invalid_OrderBook');
        require(baseToken == IOrderBook(orderBook).baseToken(), 'HybridRouter: MisOrder_Path');

        //挂单不能将eth存放在router下面，需要存在order book上，不然订单成交时没有资金来源
        IWETH(WETH).deposit{value: msg.value}();
        assert(IWETH(WETH).transfer(orderBook, msg.value));

        to = to == address(0) ? msg.sender : to;
        orderId = IOrderBook(orderBook).createBuyLimitOrder(msg.sender, price, to);
    }

    //创建将baseToken卖为quoteToken限价单 (uni -> usdc)
    function sellToken(
        uint amountOffer,
        uint price,
        address baseToken,
        address quoteToken,
        address to,
        uint deadline)
        external
        virtual
        override
        ensure(deadline)
        returns (uint orderId)
    {
        require(baseToken != quoteToken, 'HybridRouter: Invalid_Path');
        address orderBook = IOrderBookFactory(factory).getOrderBook(baseToken, quoteToken);
        require(orderBook != address(0), 'HybridRouter: Invalid_OrderBook');
        require(baseToken == IOrderBook(orderBook).baseToken(), 'HybridRouter: MisOrder_Path');

        TransferHelper.safeTransferFrom(
            baseToken, msg.sender, orderBook, amountOffer
        );

        to = to == address(0) ? msg.sender : to;
        orderId = IOrderBook(orderBook).createSellLimitOrder(msg.sender, price, to);
    }

    //创建将ETH卖为quoteToken限价单 (eth -> usdc)
    function sellEth(
        uint price,
        address baseToken,
        address quoteToken,
        address to,
        uint deadline)
        external
        virtual
        override
        payable
        ensure(deadline)
        returns (uint orderId)
    {
        require(baseToken != quoteToken, 'HybridRouter: Invalid_Path');
        require(baseToken == WETH, 'HybirdRouter: Invalid_Token');
        address orderBook = IOrderBookFactory(factory).getOrderBook(baseToken, quoteToken);
        require(orderBook != address(0), 'HybridRouter: Invalid_OrderBook');
        require(baseToken == IOrderBook(orderBook).baseToken(), 'HybridRouter: MisOrder_Path');

        //挂单不能将eth存放在router下面，需要存在order book上，不然订单成交时没有资金来源
        IWETH(WETH).deposit{value: msg.value}();
        assert(IWETH(WETH).transfer(orderBook, msg.value));

        to = to == address(0) ? msg.sender : to;
        orderId = IOrderBook(orderBook).createSellLimitOrder(msg.sender, price, to);
    }

    function getAmountsForLimitOrder(
        address orderBook,
        uint tradeDirection,
        uint amountOffer,
        uint price,
        uint reserveIn,
        uint reserveOut)
    internal
    view
    returns (uint[] memory amounts) {
        uint orderDirection = OrderBookLibrary.getOppositeDirection(tradeDirection);
        //获取价格范围内的反方向挂单
        (uint[] memory priceArray, uint[] memory amountArray) = IOrderBook(orderBook).rangeBook(orderDirection, price);
        uint decimal = IOrderBook(orderBook).priceDecimal();
        uint amountLeft = amountOffer;
        amounts = new uint[](5);

        //看看是否需要吃单
        for (uint i=0; i<priceArray.length; i++){
            uint amountInUsed;
            uint amountOutUsed;
            //先计算pair从当前价格到price消耗amountIn的数量
            (amountInUsed, amountOutUsed, reserveIn, reserveOut) = OrderBookLibrary.getAmountForMovePrice(
                tradeDirection, reserveIn, reserveOut, priceArray[i], decimal);

            //再计算amm中实际会消耗的amountIn的数量
            amounts[0] += amountInUsed > amountLeft ? amountLeft : amountInUsed;
            //再计算本次移动价格获得的amountOut
            amounts[1] += amountInUsed > amountLeft ? OrderBookLibrary.getAmountOut(amountLeft, reserveIn, reserveOut)
            : amountOutUsed;
        //再计算还剩下的amountIn
        if (amountLeft > amountInUsed) {
            amountLeft = amountLeft - amountInUsed;
        }
        else { //amountIn消耗完了
            amountLeft = 0;
            break;
        }


        //计算消耗掉一个价格的挂单需要的amountIn数量
        (uint amountInForTake, uint amountOutWithFee, uint fee) = OrderBookLibrary.getAmountOutForTakePrice(
            orderDirection, amountLeft, priceArray[i], decimal, amountArray[i]);
            amounts[3] += amountInForTake;
            amounts[4] += amountOutWithFee;
            amounts[5] += fee;
            if (amountLeft > amountInForTake) {
                amountLeft = amountLeft - amountInForTake;
            }
            else{
                amountLeft = 0;
                break;
            }
        }

        if (amountLeft > 0) {
            uint amountInUsed;
            uint amountOutUsed;
            //先计算pair从当前价格到price消耗amountIn的数量
            (amountInUsed, amountOutUsed, reserveIn, reserveOut) = OrderBookLibrary.getAmountForMovePrice(
                tradeDirection, reserveIn, reserveOut, price, decimal);

            //再计算amm中实际会消耗的amountIn的数量
            amounts[0] += amountInUsed > amountLeft ? amountLeft : amountInUsed;
            //再计算本次移动价格获得的amountOut
            amounts[1] += amountInUsed > amountLeft ?
                OrderBookLibrary.getAmountOut(amountLeft, reserveIn, reserveOut) : amountOutUsed;
        }
    }

    //需要考虑初始价格到目标价格之间还有其它挂单的情况，需要考虑最小数量
    function getAmountsForBuy(uint amountOffer, uint price, address baseToken, address quoteToken)
    external view
    returns (uint[] memory amounts) { //返回ammAmountIn, ammAmountOut, orderAmountIn, orderAmountOut, fee
        require(baseToken != quoteToken, 'HybridRouter: Invalid_Path');
        address orderBook = IOrderBookFactory(factory).getOrderBook(baseToken, quoteToken);
        require(orderBook != address(0), 'HybridRouter: Invalid_OrderBook');
        require(baseToken == IOrderBook(orderBook).baseToken(), 'HybridRouter: MisOrder_Path');

        (uint reserveIn, uint reserveOut) = OrderBookLibrary.getReserves(
            IOrderBook(orderBook).pair(),
            quoteToken,
            baseToken);
        amounts = getAmountsForLimitOrder(orderBook, OrderBookLibrary.LIMIT_BUY,
            amountOffer, price, reserveIn, reserveOut);
    }

    //需要考虑初始价格到目标价格之间还有其它挂单的情况，需要考虑最小数量
    function getAmountsForSell(uint amountOffer, uint price, address baseToken, address quoteToken)
    external view
    returns (uint[] memory amounts) { //返回ammAmountIn, ammAmountOut, orderAmountIn, orderAmountOut
        require(baseToken != quoteToken, 'HybridRouter: Invalid_Path');
        address orderBook = IOrderBookFactory(factory).getOrderBook(baseToken, quoteToken);
        require(orderBook != address(0), 'HybridRouter: Invalid_OrderBook');
        require(baseToken == IOrderBook(orderBook).baseToken(), 'HybridRouter: MisOrder_Path');

        (uint reserveIn, uint reserveOut) = OrderBookLibrary.getReserves(
            IOrderBook(orderBook).pair(),
            baseToken,
            quoteToken);
        amounts = getAmountsForLimitOrder(orderBook, OrderBookLibrary.LIMIT_SELL,
            amountOffer, price, reserveIn, reserveOut);
    }

    //获取订单薄
    function getOrderBook(address baseToken, address quoteToken, uint32 limitSize)
    external view
    returns
    (uint price, uint[] memory buyPrices, uint[] memory buyAmounts, uint[] memory sellPrices, uint[] memory sellAmounts)
    {
        require(baseToken != quoteToken, 'HybridRouter: Invalid_Path');
        address orderBook = IOrderBookFactory(factory).getOrderBook(baseToken, quoteToken);
        if (orderBook != address(0)) {
            price = IOrderBook(orderBook).getPrice();
            (buyPrices, buyAmounts) = IOrderBook(orderBook).marketBook(OrderBookLibrary.LIMIT_BUY, limitSize);
            (sellPrices, sellAmounts) = IOrderBook(orderBook).marketBook(OrderBookLibrary.LIMIT_SELL, limitSize);
        }
    }
}
