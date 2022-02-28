import chai, {expect} from 'chai'
import {Contract, Wallet} from 'ethers'
import {solidity, MockProvider, createFixtureLoader} from 'ethereum-waffle'
import {BigNumber, bigNumberify} from 'ethers/utils'
import {MaxUint256} from 'ethers/constants'
import {expandTo18Decimals, mineBlock, encodePrice, printOrder, printOrder2, printArray} from './shared/utilities'
import {orderBookFixture} from './shared/fixtures'
import {AddressZero} from 'ethers/constants'

const MINIMUM_LIQUIDITY = bigNumberify(10).pow(3)

chai.use(solidity)

const overrides = {
    gasLimit: 99999999
}

describe('HybridxOrderBook', () => {
    const provider = new MockProvider({
        hardfork: 'istanbul',
        mnemonic: 'horn horn horn horn horn horn horn horn horn horn horn horn',
        gasLimit: 999999999
    })

    const [wallet, other, three, four, five] = provider.getWallets()
    const loadFixture = createFixtureLoader(provider, [wallet])

    const LIMIT_BUY = 1;
    const LIMIT_SELL = 2;

    let factory: Contract
    let token0: Contract
    let token1: Contract
    let pair: Contract
    let orderBook: Contract
    let orderBookFactory: Contract
    let hybridRouter: Contract
    let tokenBase: Contract
    let tokenQuote: Contract

    let router: Contract
    beforeEach(async () => {
        const fixture = await loadFixture(orderBookFixture)
        factory = fixture.factory
        token0 = fixture.token0
        token1 = fixture.token1
        pair = fixture.pair
        orderBook = fixture.orderBook
        orderBookFactory = fixture.orderBookFactory
        hybridRouter = fixture.router
        tokenBase = fixture.tokenA
        tokenQuote = fixture.tokenB
        router = fixture.router02

        await factory.setOrderBookFactory(orderBookFactory.address);
    })

    afterEach(async function () {
        expect(await provider.getBalance(hybridRouter.address)).to.eq(0)
    })

    async function pairInfo() {
        // balance
        let pairTokenBase = await tokenBase.balanceOf(pair.address)
        console.log('pair Base tokenA balance：', pairTokenBase.toString())

        let pairTokenQuote = await tokenQuote.balanceOf(pair.address)
        console.log('pair Quote tokenB balance：', pairTokenQuote.toString())

        // K
        let [reserve0, reserve1] = await pair.getReserves()
        let k = reserve0 * reserve1
        console.log('pair K：', k.toString())

        // 价格
        let pairPrice = reserve1 / reserve0
        console.log('pair price：', pairPrice.toString())

        let pairPriceLibrary = await orderBook.getPrice()
        console.log('pair price Library：', pairPriceLibrary.toString())
    }

    async function getUserOrders(walletName: string) {
        let num
        switch (walletName) {
            case 'wallet':
                num = await orderBook.getUserOrders(wallet.address)
                break;
            case 'other':
                num = await orderBook.getUserOrders(other.address)
                break;
            case 'three':
                num = await orderBook.getUserOrders(three.address)
                break;
            case 'four':
                num = await orderBook.getUserOrders(four.address)
                break;
            case 'five':
                num = await orderBook.getUserOrders(five.address)
                break;
            default:
                num = await orderBook.getUserOrders(wallet.address)
                break;
        }

        let i = 1
        for (const o of num) {
            console.log(walletName + ' orders：', i++)

            let [a, b, c, d, e, f, g, h] = await orderBook.marketOrder(o)
            console.log('o.owner:', a.toString())
            console.log('o.to:', b.toString())
            console.log('o.orderId:', c.toString())
            console.log('o.price:', d.toString())
            console.log('o.amountOffer:', e.toString())
            console.log('o.amountRemain:', f.toString())
            console.log('o.orderType:', g.toString())
            console.log('o.orderIndex:', h.toString())
        }
    }

    async function balancePrint() {
        // pair余额
        let pairToken0Balance = await token0.balanceOf(pair.address)
        let pairToken1Balance = await token1.balanceOf(pair.address)
        console.log('pairToken0 balance：', pairToken0Balance.toString())
        console.log('pairToken1 balance：', pairToken1Balance.toString())

        // orderBook配置
        let baseBalance = await orderBook.baseBalance();
        console.log('orderBook baseBalance：', baseBalance.toString())

        let quoteBalance = await orderBook.quoteBalance();
        console.log('orderBook quoteBalance：', quoteBalance.toString())

        let baseBalanceERC20 = await tokenBase.balanceOf(orderBook.address)
        console.log('orderBook baseBalance ERC20：', baseBalanceERC20.toString())

        let quoteBalanceERC20 = await tokenQuote.balanceOf(orderBook.address);
        console.log('orderBook quoteBalance ERC20：', quoteBalanceERC20.toString())

        let minAmount = await orderBook.minAmount();
        console.log('orderBook minAmount：', minAmount.toString())

        let priceStep = await orderBook.priceStep();
        console.log('orderBook priceStep：', priceStep.toString())

        // 钱包余额
        let tokenBaseBalance = await tokenBase.balanceOf(wallet.address)
        let tokenQuoteBalance = await tokenQuote.balanceOf(wallet.address)
        console.log('wallet tokenBase Balance:', tokenBaseBalance.toString())
        console.log('wallet tokenQuote Balance:', tokenQuoteBalance.toString())
    }

    it('createLimitOrder：require', async () => {
        let limitAmount = expandTo18Decimals(1) // 转账金额
        let limitPrice = expandTo18Decimals(0) // 下单价格

        await tokenQuote.approve(hybridRouter.address, MaxUint256) // 授权合约使用token
        await expect(hybridRouter.buyWithToken(limitAmount, limitPrice, tokenBase.address, tokenQuote.address, wallet.address, MaxUint256, overrides))
            .to.be.revertedWith('Price Invalid')

        await tokenBase.approve(hybridRouter.address, MaxUint256) // 授权合约使用token
        await expect(hybridRouter.sellToken(limitAmount, limitPrice, tokenBase.address, tokenQuote.address, wallet.address, MaxUint256, overrides))
            .to.be.revertedWith('Price Invalid')
    })

    // 挂买单
    it('createBuyLimitOrder：', async () => {
        let limitAmount = expandTo18Decimals(1)
        let limitPrice = expandTo18Decimals(1)

        await tokenQuote.approve(hybridRouter.address, MaxUint256)
        await expect(hybridRouter.buyWithToken(limitAmount, limitPrice, tokenBase.address, tokenQuote.address, wallet.address, MaxUint256, overrides))
            .to.emit(tokenQuote, "Transfer").withArgs(wallet.address, orderBook.address, limitAmount)
            .to.emit(orderBook, "OrderCreated").withArgs(wallet.address, wallet.address, limitAmount, limitAmount, limitPrice, LIMIT_BUY)
    })

    // 挂买单 - 卖单吃单
    it('createBuyLimitOrder：move price Sell', async () => {
        let limitAmount = expandTo18Decimals(1) // 转账金额
        let limitPrice = expandTo18Decimals(1) // 下单价格

        await tokenQuote.approve(hybridRouter.address, MaxUint256) // 授权合约使用token
        await expect(hybridRouter.buyWithToken(limitAmount, limitPrice, tokenBase.address, tokenQuote.address, wallet.address, MaxUint256, overrides))
            .to.emit(tokenQuote, "Transfer").withArgs(wallet.address, orderBook.address, limitAmount)
            .to.emit(orderBook, "OrderCreated").withArgs(wallet.address, wallet.address, limitAmount, limitAmount, limitPrice, LIMIT_BUY)


        limitPrice = expandTo18Decimals(2) // 下单价格

        await tokenBase.approve(hybridRouter.address, MaxUint256) // 授权合约使用token
        await expect(hybridRouter.sellToken(limitAmount, limitPrice, tokenBase.address, tokenQuote.address, wallet.address, MaxUint256, overrides))
            .to.emit(tokenBase, "Transfer").withArgs(wallet.address, orderBook.address, limitAmount)
            .to.emit(orderBook, "OrderCreated").withArgs(wallet.address, wallet.address, limitAmount, limitAmount, limitPrice, LIMIT_SELL)

        await pairInfo()
        await balancePrint()
    })

    // 挂买单 - swap吃单 ：吃一部分
    it('createBuyLimitOrder：move some price swap', async () => {
        let limitAmount = expandTo18Decimals(3)
        let limitPrice = expandTo18Decimals(2)

        await tokenQuote.approve(hybridRouter.address, MaxUint256)
        await expect(hybridRouter.buyWithToken(limitAmount, limitPrice, tokenBase.address, tokenQuote.address, wallet.address, MaxUint256, overrides))
            .to.emit(tokenQuote, "Transfer").withArgs(wallet.address, orderBook.address, limitAmount)
            .to.emit(orderBook, "OrderCreated").withArgs(wallet.address, wallet.address, limitAmount, limitAmount, limitPrice, LIMIT_BUY)

        const swapAmount = expandTo18Decimals(1) // 兑换额
        const path = [tokenBase.address, tokenQuote.address]
        const [out1, out2] = await router.getAmountsOut(swapAmount, path)
        console.log("tokenBaseAmountOut : ", out1.toString())
        console.log("tokenQuoteAmountOut: ", out2.toString())

        await tokenBase.transfer(pair.address, swapAmount)
        await pair.swap(0, out1, wallet.address, '0x', overrides)

        await pairInfo()
        await balancePrint()
        await getUserOrders('wallet')
    })

    // 挂买单 - swap吃单 ：全吃
    it('createBuyLimitOrder：move all price swap', async () => {
        let limitAmount = expandTo18Decimals(1)
        let limitPrice = expandTo18Decimals(2)

        await tokenQuote.approve(hybridRouter.address, MaxUint256)
        await expect(hybridRouter.buyWithToken(limitAmount, limitPrice, tokenBase.address, tokenQuote.address, wallet.address, MaxUint256, overrides))
            .to.emit(tokenQuote, "Transfer").withArgs(wallet.address, orderBook.address, limitAmount)
            .to.emit(orderBook, "OrderCreated").withArgs(wallet.address, wallet.address, limitAmount, limitAmount, limitPrice, LIMIT_BUY)

        const swapAmount = expandTo18Decimals(5) // 兑换额
        const path = [tokenBase.address, tokenQuote.address]
        const [out1, out2] = await router.getAmountsOut(swapAmount, path)
        console.log("tokenBaseAmountOut : ", out1.toString())
        console.log("tokenQuoteAmountOut: ", out2.toString())

        await tokenBase.transfer(pair.address, swapAmount)
        await pair.swap(0, out1, wallet.address, '0x', overrides)

        await pairInfo()
        await balancePrint()
        await getUserOrders('wallet')
    })

    // 挂卖单
    it('createSellLimitOrder：', async () => {
        let limitAmount = expandTo18Decimals(1) // 转账金额
        let limitPrice = expandTo18Decimals(2) // 下单价格

        await tokenBase.approve(hybridRouter.address, MaxUint256) // 授权合约使用token
        await expect(hybridRouter.sellToken(limitAmount, limitPrice, tokenBase.address, tokenQuote.address, wallet.address, MaxUint256, overrides))
            .to.emit(tokenBase, "Transfer").withArgs(wallet.address, orderBook.address, limitAmount)
            .to.emit(orderBook, "OrderCreated").withArgs(wallet.address, wallet.address, limitAmount, limitAmount, limitPrice, LIMIT_SELL)
    })

    // 挂卖单 - 买单吃单
    it('createSellLimitOrder：move price Buy', async () => {
        let limitAmount = expandTo18Decimals(1) // 转账金额
        let limitPrice = expandTo18Decimals(2) // 下单价格

        await tokenBase.approve(hybridRouter.address, MaxUint256) // 授权合约使用token
        await expect(hybridRouter.sellToken(limitAmount, limitPrice, tokenBase.address, tokenQuote.address, wallet.address, MaxUint256, overrides))
            .to.emit(tokenBase, "Transfer").withArgs(wallet.address, orderBook.address, limitAmount)
            .to.emit(orderBook, "OrderCreated").withArgs(wallet.address, wallet.address, limitAmount, limitAmount, limitPrice, LIMIT_SELL)

        limitPrice = expandTo18Decimals(1)
        await tokenQuote.approve(hybridRouter.address, MaxUint256) // 授权合约使用token
        await expect(hybridRouter.buyWithToken(limitAmount, limitPrice, tokenBase.address, tokenQuote.address, wallet.address, MaxUint256, overrides))
            .to.emit(tokenQuote, "Transfer").withArgs(wallet.address, orderBook.address, limitAmount)
            .to.emit(orderBook, "OrderCreated").withArgs(wallet.address, wallet.address, limitAmount, limitAmount, limitPrice, LIMIT_BUY)
    })

    // 挂卖单 - swap吃单 ：吃一部分
    it('createSellLimitOrder：move some price swap', async () => {
        let limitAmount = expandTo18Decimals(3) // 转账金额
        let limitPrice = expandTo18Decimals(2) // 下单价格

        await tokenBase.approve(hybridRouter.address, MaxUint256) // 授权合约使用token
        await expect(hybridRouter.sellToken(limitAmount, limitPrice, tokenBase.address, tokenQuote.address, wallet.address, MaxUint256, overrides))
            .to.emit(tokenBase, "Transfer").withArgs(wallet.address, orderBook.address, limitAmount)
            .to.emit(orderBook, "OrderCreated").withArgs(wallet.address, wallet.address, limitAmount, limitAmount, limitPrice, LIMIT_SELL)

        const swapAmount = expandTo18Decimals(2) // 兑换额
        const expectedOutputAmount = bigNumberify('1662497915624478906') // 预计输出

        const path = [tokenBase.address, tokenQuote.address]
        const [out1, out2] = await router.getAmountsOut(swapAmount, path)
        console.log("tokenBaseAmountOut : " , out1.toString())
        console.log("tokenQuoteAmountOut: " , out2.toString())

        // ['997000000000000000', 10, 5, 1],
        await tokenQuote.transfer(pair.address, swapAmount)
        await pair.swap(out2, 0, wallet.address, '0x', overrides)

        await pairInfo()
        await balancePrint()
        await getUserOrders('wallet')
    })

    // 挂卖单 - swap吃单 : 全吃
    it('createBuyLimitOrder：move all price swap', async () => {
        let limitAmount = expandTo18Decimals(1) // 转账金额
        let limitPrice = expandTo18Decimals(2) // 下单价格

        await tokenBase.approve(hybridRouter.address, MaxUint256) // 授权合约使用token
        await expect(hybridRouter.sellToken(limitAmount, limitPrice, tokenBase.address, tokenQuote.address, wallet.address, MaxUint256, overrides))
            .to.emit(tokenBase, "Transfer").withArgs(wallet.address, orderBook.address, limitAmount)
            .to.emit(orderBook, "OrderCreated").withArgs(wallet.address, wallet.address, limitAmount, limitAmount, limitPrice, LIMIT_SELL)

        const swapAmount = expandTo18Decimals(2) // 兑换额
        const expectedOutputAmount = bigNumberify('1662497915624478906') // 预计输出

        const path = [tokenBase.address, tokenQuote.address]
        const [out1, out2] = await router.getAmountsOut(swapAmount, path)
        console.log("tokenBaseAmountOut : " , out1.toString())
        console.log("tokenQuoteAmountOut: " , out2.toString())

        // ['997000000000000000', 10, 5, 1],
        await tokenQuote.transfer(pair.address, swapAmount)
        await pair.swap(out2, 0, wallet.address, '0x', overrides)

        await pairInfo()
        await balancePrint()
        await getUserOrders('wallet')
    })

    async function transferToOther() {
        await tokenQuote.transfer(other.address, expandTo18Decimals(1000))
        await tokenBase.transfer(other.address, expandTo18Decimals(1000))
    }

    async function transferToThree() {
        await tokenQuote.transfer(three.address, expandTo18Decimals(1000))
        await tokenBase.transfer(three.address, expandTo18Decimals(1000))
    }

    async function transferToFour() {
        await tokenQuote.transfer(four.address, expandTo18Decimals(1000))
        await tokenBase.transfer(four.address, expandTo18Decimals(1000))
    }

    async function transferToFive() {
        await tokenQuote.transfer(five.address, expandTo18Decimals(1000))
        await tokenBase.transfer(five.address, expandTo18Decimals(1000))
    }

    async function walletCreateOrder(walletName: string,
                                     amount: number,
                                     price: number,
                                     LIMIT: number,
                                     transfer: boolean,
                                     print: boolean) {
        let limitAmount = expandTo18Decimals(amount)
        let limitPrice = expandTo18Decimals(price)
        let _wallet: Wallet = wallet;

        switch (walletName) {
            case 'wallet':
                _wallet = wallet
                break;
            case 'other':
                if (transfer) await transferToOther()
                _wallet = other
                break;
            case 'three':
                if (transfer) await transferToThree()
                _wallet = three
                break;
            case 'four':
                if (transfer) await transferToFour()
                _wallet = four
                break;
            case 'five':
                if (transfer) await transferToFive()
                _wallet = five
                break;
        }

        if (LIMIT == LIMIT_BUY) {
            await tokenQuote.connect(_wallet).approve(hybridRouter.address, MaxUint256)
            await expect(hybridRouter.connect(_wallet).buyWithToken(limitAmount, limitPrice, tokenBase.address, tokenQuote.address, _wallet.address, MaxUint256, overrides))
                .to.emit(tokenQuote, "Transfer").withArgs(_wallet.address, orderBook.address, limitAmount)
                .to.emit(orderBook, "OrderCreated").withArgs(_wallet.address, _wallet.address, limitAmount, limitAmount, limitPrice, LIMIT_BUY)
        }

        if (LIMIT == LIMIT_SELL) {
            await tokenBase.connect(_wallet).approve(hybridRouter.address, MaxUint256) // 授权合约使用token
            await expect(hybridRouter.connect(_wallet).sellToken(limitAmount, limitPrice, tokenBase.address, tokenQuote.address, _wallet.address, MaxUint256, overrides))
                .to.emit(tokenBase, "Transfer").withArgs(_wallet.address, orderBook.address, limitAmount)
                .to.emit(orderBook, "OrderCreated").withArgs(_wallet.address, _wallet.address, limitAmount, limitAmount, limitPrice, LIMIT_SELL)
        }

        if (print) await getUserOrders(walletName)
    }

    // 多钱包操作 - 挂多个价格买单
    it('createBuyLimitOrder：multiple wallet', async () => {
        await walletCreateOrder('other', 1, 2, LIMIT_BUY, true, true)
        await walletCreateOrder('other', 2, 2, LIMIT_BUY, true, true)
        await walletCreateOrder('other', 1, 1, LIMIT_BUY, true, true)
        await walletCreateOrder('three', 1, 2, LIMIT_BUY, true, true)
        await walletCreateOrder('four', 1, 2, LIMIT_BUY, true, true)
        await walletCreateOrder('five', 1, 2, LIMIT_BUY, true, true)
    })

    // 多钱包操作 - 挂多个价格买单，多个价格卖单吃单
    it('createBuyLimitOrder：multiple wallet move price SELL', async () => {
        await walletCreateOrder('other', 1, 1, LIMIT_BUY, true, false)
        await walletCreateOrder('other', 1, 2, LIMIT_BUY, false, false)
        await walletCreateOrder('other', 2, 2, LIMIT_BUY, false, false)
        await walletCreateOrder('three', 5, 1, LIMIT_BUY, true, false)

        // ['other', 1, 2, LIMIT_SELL, false, false]
        let limitAmount = expandTo18Decimals(2)
        let limitPrice = expandTo18Decimals(2)
        let expectAmountRemain = bigNumberify('504500000000000000') // 被吃 1 - 501500000000000000 = 498500000000000000
        await tokenBase.connect(other).approve(hybridRouter.address, MaxUint256)
        await expect(hybridRouter.connect(other).sellToken(limitAmount, limitPrice, tokenBase.address, tokenQuote.address, other.address, MaxUint256, overrides))
            .to.emit(tokenBase, "Transfer").withArgs(other.address, orderBook.address, limitAmount)
            .to.emit(orderBook, "OrderCreated").withArgs(other.address, other.address, limitAmount, expectAmountRemain, limitPrice, LIMIT_SELL)

        // ['five', 2, 2, LIMIT_SELL, false, false]
        limitAmount = expandTo18Decimals(10)
        limitPrice = expandTo18Decimals(1)
        expectAmountRemain = bigNumberify('1943820234006285947') // 被吃 1 - 2000000000000000000 = 0 ？？
        await transferToFive()
        await tokenBase.connect(five).approve(hybridRouter.address, MaxUint256)
        await expect(hybridRouter.connect(five).sellToken(limitAmount, limitPrice, tokenBase.address, tokenQuote.address, five.address, MaxUint256, overrides))
            .to.emit(tokenBase, "Transfer").withArgs(five.address, orderBook.address, limitAmount)
            .to.emit(orderBook, "OrderCreated").withArgs(five.address, five.address, limitAmount, expectAmountRemain, limitPrice, LIMIT_SELL)

        // ['other', 1, 2, LIMIT_SELL, false, false]
        limitAmount = expandTo18Decimals(1)
        limitPrice = expandTo18Decimals(2)
        expectAmountRemain = bigNumberify('1000000000000000000') // 被吃 1 - 501500000000000000 = 498500000000000000
        await tokenBase.connect(five).approve(hybridRouter.address, MaxUint256)
        await expect(hybridRouter.connect(five).sellToken(limitAmount, limitPrice, tokenBase.address, tokenQuote.address, five.address, MaxUint256, overrides))
            .to.emit(tokenBase, "Transfer").withArgs(five.address, orderBook.address, limitAmount)
            .to.emit(orderBook, "OrderCreated").withArgs(five.address, five.address, limitAmount, expectAmountRemain, limitPrice, LIMIT_SELL)
    })

})
