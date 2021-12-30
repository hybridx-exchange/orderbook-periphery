import chai, { expect } from 'chai'
import { Contract } from 'ethers'
import { solidity, MockProvider, createFixtureLoader } from 'ethereum-waffle'
import { BigNumber, bigNumberify } from 'ethers/utils'
import { MaxUint256 } from 'ethers/constants'
import {expandTo18Decimals, mineBlock, encodePrice, printOrder, printOrder2, printArray} from './shared/utilities'
import { orderBookFixture } from './shared/fixtures'
import { AddressZero } from 'ethers/constants'

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
  const [wallet, other] = provider.getWallets()
  const loadFixture = createFixtureLoader(provider, [wallet])

  let factory: Contract
  let token0: Contract
  let token1: Contract
  let pair: Contract
  let orderBook: Contract
  let orderBookFactory: Contract
  let hybridRouter: Contract
  let tokenBase: Contract
  let tokenQuote: Contract
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
  })

  afterEach(async function() {
    expect(await provider.getBalance(hybridRouter.address)).to.eq(0)
  })

  /*it('buyWithToken: buy limit price <= start price == end price', async () => {
    await factory.setOrderBookFactory(orderBookFactory.address);
    const minAmount = await orderBook.minAmount()
    expect(minAmount).to.eq(bigNumberify("1000"))
    let limitAmount = expandTo18Decimals(1)
    let currentPrice = await orderBook.getPrice()
    let limitPrice = expandTo18Decimals(1)
    let direction = bigNumberify(1)
    await tokenQuote.approve(hybridRouter.address, MaxUint256)

    await expect(hybridRouter.buyWithToken(limitAmount, limitPrice, tokenBase.address, tokenQuote.address, wallet.address, MaxUint256, overrides))
        .to.emit(tokenQuote, "Transfer").withArgs(wallet.address, orderBook.address, limitAmount)
        .to.emit(orderBook, "OrderCreated").withArgs(wallet.address, wallet.address, limitAmount, limitAmount, limitPrice, direction)

    let order = await orderBook.marketOrders(1);
    expect(order.amountRemain).to.eq(limitAmount)

    let order2 = await orderBook.marketOrder(1)
    expect(order2.length > 5 && order2[5]).to.eq(limitAmount)

    let quoteBalance = await orderBook.quoteBalance();
    expect(quoteBalance).to.eq(limitAmount)

    limitPrice = expandTo18Decimals(2)
    await expect(hybridRouter.buyWithToken(limitAmount, limitPrice, tokenBase.address, tokenQuote.address, wallet.address, MaxUint256, overrides))
        .to.emit(tokenQuote, "Transfer").withArgs(wallet.address, orderBook.address, limitAmount)
        .to.emit(orderBook, "OrderCreated").withArgs(wallet.address, wallet.address, limitAmount, limitAmount, limitPrice, direction)
    order = await orderBook.marketOrders(2);
    expect(order.amountRemain).to.eq(limitAmount)

    order2 = await orderBook.marketOrder(2)
    expect(order2.length > 5 && order2[5]).to.eq(limitAmount)

    quoteBalance = await orderBook.quoteBalance();
    expect(quoteBalance).to.eq(limitAmount.add(limitAmount))

    expect(await orderBook.getUserOrders(wallet.address)).to.deep.eq([bigNumberify("1"), bigNumberify("2")])
    expect(await hybridRouter.getOrderBook(tokenBase.address, tokenQuote.address, 32)).to.deep.eq([
        currentPrice,
        [expandTo18Decimals(2), expandTo18Decimals(1)],
        [limitAmount, limitAmount],
        [],
        []
    ])
  })

  it('buyWithToken: start price < end price < buy limit price', async () => {
    await factory.setOrderBookFactory(orderBookFactory.address);
    const minAmount = await orderBook.minAmount()
    expect(minAmount).to.eq(bigNumberify("1000"))
    let limitAmount = expandTo18Decimals(1)
    let currentPrice = await orderBook.getPrice()
    let decimal = bigNumberify(18)
    let limitPrice = expandTo18Decimals(2)
    let direction = bigNumberify(1)
    await tokenQuote.approve(hybridRouter.address, MaxUint256)

    await expect(hybridRouter.buyWithToken(limitAmount, limitPrice, tokenBase.address, tokenQuote.address, wallet.address, MaxUint256, overrides))
        .to.emit(tokenQuote, "Transfer").withArgs(wallet.address, orderBook.address, limitAmount)
        .to.emit(orderBook, "OrderCreated").withArgs(wallet.address, wallet.address, limitAmount, limitAmount, limitPrice, direction)

    let order = await orderBook.marketOrders(1);
    expect(order.amountRemain).to.eq(limitAmount)

    let order2 = await orderBook.marketOrder(1)
    expect(order2.length > 5 && order2[5]).to.eq(limitAmount)

    let quoteBalance = await orderBook.quoteBalance();
    expect(quoteBalance).to.eq(limitAmount)

    expect(currentPrice).to.eq(limitPrice)

    let reserves = await orderBook.getReserves()
    let expectOutputAmount = await hybridRouter.getAmountOut(limitAmount, reserves[1], reserves[0])

    limitPrice = expandTo18Decimals(3)
    await expect(hybridRouter.buyWithToken(limitAmount, limitPrice, tokenBase.address, tokenQuote.address, wallet.address, MaxUint256, overrides))
        .to.emit(tokenQuote, "Transfer").withArgs(wallet.address, orderBook.address, limitAmount)
        .to.emit(tokenQuote, "Transfer").withArgs(orderBook.address, pair.address, limitAmount)
        .to.emit(tokenBase, "Transfer").withArgs(pair.address, wallet.address, expectOutputAmount)

    quoteBalance = await orderBook.quoteBalance();
    expect(quoteBalance).to.eq(limitAmount)

    currentPrice = await hybridRouter.getPrice(reserves[0].sub(expectOutputAmount), reserves[1].add(limitAmount), decimal)
    //console.log("current price:", currentPrice.toString())

    expect(await orderBook.getUserOrders(wallet.address)).to.deep.eq([bigNumberify("1")])
    expect(await hybridRouter.getOrderBook(tokenBase.address, tokenQuote.address, 32)).to.deep.eq([
      currentPrice,
      [expandTo18Decimals(2)],
      [limitAmount],
      [],
      []
    ])
  })

  it('buyWithToken: start price < end price == buy limit price', async () => {
    await factory.setOrderBookFactory(orderBookFactory.address);
    const minAmount = await orderBook.minAmount()
    expect(minAmount).to.eq(bigNumberify("1000"))
    let limitAmount = expandTo18Decimals(1)
    let currentPrice = await orderBook.getPrice()
    let decimal = bigNumberify(18)
    let decimalAmount = expandTo18Decimals(1)
    let limitPrice = expandTo18Decimals(2)
    let direction = bigNumberify(1)
    await tokenQuote.approve(hybridRouter.address, MaxUint256)

    await expect(hybridRouter.buyWithToken(limitAmount, limitPrice, tokenBase.address, tokenQuote.address, wallet.address, MaxUint256, overrides))
        .to.emit(tokenQuote, "Transfer").withArgs(wallet.address, orderBook.address, limitAmount)
        .to.emit(orderBook, "OrderCreated").withArgs(wallet.address, wallet.address, limitAmount, limitAmount, limitPrice, direction)

    let order = await orderBook.marketOrders(1);
    expect(order.amountRemain).to.eq(limitAmount)

    let order2 = await orderBook.marketOrder(1)
    expect(order2.length > 5 && order2[5]).to.eq(limitAmount)

    let quoteBalance = await orderBook.quoteBalance();
    expect(quoteBalance).to.eq(limitAmount)

    expect(currentPrice).to.eq(limitPrice)

    let reserves = await orderBook.getReserves()
    limitPrice = expandTo18Decimals(3)
    limitAmount = expandTo18Decimals(10)
    let results = await hybridRouter.getAmountForMovePrice(direction, limitAmount, reserves[0], reserves[1], limitPrice, decimal)
    let results2 = await hybridRouter.getFixAmountForMovePriceUp(results[0], results[2], results[3], results[4], limitPrice, decimal);
    //console.log("amount left:", results2[0].toString())
    //console.log("amm amount in:", results2[1].toString())
    //console.log("amm amount in fixed:", results2[2].toString())
    //console.log("amm amount out:", results[1].toString())
    //console.log("reserve base:", results[3].toString())
    //console.log("reserve quote:", results[4].add(results2[2]).toString())
    //console.log("price:", ((results[4].add(results2[2])).mul(decimalAmount).div(results[3])).toString())
    let expectOutputAmount = results[1]
    let expectInputAmount = results2[1]

    await expect(hybridRouter.buyWithToken(limitAmount, limitPrice, tokenBase.address, tokenQuote.address, wallet.address, MaxUint256, overrides))
        .to.emit(tokenQuote, "Transfer").withArgs(wallet.address, orderBook.address, limitAmount)
        .to.emit(tokenQuote, "Transfer").withArgs(orderBook.address, pair.address, expectInputAmount)
        .to.emit(tokenBase, "Transfer").withArgs(pair.address, wallet.address, expectOutputAmount)
        .to.emit(orderBook, "OrderCreated").withArgs(wallet.address, wallet.address, limitAmount, limitAmount.sub(expectInputAmount), limitPrice, direction)

    quoteBalance = await orderBook.quoteBalance();
    expect(quoteBalance).to.eq(expandTo18Decimals(1).add(limitAmount.sub(expectInputAmount)))

    currentPrice = await hybridRouter.getPrice(reserves[0].sub(expectOutputAmount), reserves[1].add(expectInputAmount), decimal)
    expect(currentPrice).to.eq(limitPrice)

    expect(await orderBook.getUserOrders(wallet.address)).to.deep.eq([bigNumberify("1"), bigNumberify("2")])
    expect(await hybridRouter.getOrderBook(tokenBase.address, tokenQuote.address, 32)).to.deep.eq([
      currentPrice,
      [expandTo18Decimals(3), expandTo18Decimals(2)],
      [limitAmount.sub(expectInputAmount), expandTo18Decimals(1)],
      [],
      []
    ])
  })*/

  it('buyWithToken: match limit order, buy limit price == min sell limit price == current price', async () => {
    await factory.setOrderBookFactory(orderBookFactory.address);
    let decimal = bigNumberify(18)
    let decimalAmount = expandTo18Decimals(1)
    let limitAmount = expandTo18Decimals(2)
    let limitPrices = [
      expandTo18Decimals(2),
      bigNumberify("2100000000000000000"),
      bigNumberify("2200000000000000000"),
      bigNumberify("2300000000000000000"),
      bigNumberify("2400000000000000000"),
      bigNumberify("2500000000000000000"),
      bigNumberify("2600000000000000000"),
      bigNumberify("2700000000000000000"),
      bigNumberify("2800000000000000000")]

    for (let i=0; i<limitPrices.length; i++) {
      await tokenBase.transfer(orderBook.address, limitAmount)
      await orderBook.createSellLimitOrder(wallet.address, limitPrices[i], wallet.address, overrides)
    }

    let baseBalance = await orderBook.baseBalance();
    expect(baseBalance).to.eq(limitAmount.mul(limitPrices.length))

    expect((await orderBook.getUserOrders(wallet.address)).length).to.eq(9)

    let limitPrice = expandTo18Decimals(2)
    limitAmount = expandTo18Decimals(1)
    let currentPrice = await orderBook.getPrice()
    expect(currentPrice).to.eq(limitPrice)
    let direction = bigNumberify(1)
    await tokenQuote.approve(hybridRouter.address, MaxUint256)

    //let reserves = await orderBook.getReserves()
    //let results = await hybridRouter.getAmountForMovePrice(direction, limitAmount, reserves[0], reserves[1],
    // limitPrice, decimal)
    //let results2 = await hybridRouter.getFixAmountForMovePriceUp(results[0], results[2], results[3], results[4],
    // limitPrice, decimal);
    //console.log("amount left:", results2[0].toString())
    //console.log("amm amount in:", results2[1].toString())
    //console.log("amm amount in fixed:", results2[2].toString())
    //console.log("amm amount out:", results[1].toString())
    //console.log("reserve base:", results[3].toString())
    //console.log("reserve quote:", results[4].add(results2[2]).toString())
    //console.log("price:", ((results[4].add(results2[2])).mul(decimalAmount).div(results[3])).toString())

    let result3 = await hybridRouter.getAmountOutForTakePrice(bigNumberify(1), limitAmount, limitPrice, decimal, expandTo18Decimals(2))
    //console.log("amount out with fee:", result3[1].toString())

    await expect(hybridRouter.buyWithToken(limitAmount, limitPrice, tokenBase.address, tokenQuote.address, wallet.address, MaxUint256, overrides))
        .to.emit(tokenQuote, "Transfer").withArgs(wallet.address, orderBook.address, limitAmount)
        .to.emit(tokenBase, "Transfer").withArgs(orderBook.address, wallet.address, result3[1])

    expect((await orderBook.getUserOrders(wallet.address)).length).to.eq(9)
    //let order = await orderBook.marketOrders(10);
    //printOrder(order)
    //order = await orderBook.marketOrders(1);
    //printOrder(order)

    let quoteBalance = await orderBook.quoteBalance();
    expect(quoteBalance).to.eq(bigNumberify(0))

    expect(currentPrice).to.eq(limitPrice)
    expect(await hybridRouter.getOrderBook(tokenBase.address, tokenQuote.address, 32)).to.deep.eq([
      currentPrice,
      [],
      [],
      [
        expandTo18Decimals(2),
        bigNumberify("2100000000000000000"),
        bigNumberify("2200000000000000000"),
        bigNumberify("2300000000000000000"),
        bigNumberify("2400000000000000000"),
        bigNumberify("2500000000000000000"),
        bigNumberify("2600000000000000000"),
        bigNumberify("2700000000000000000"),
        bigNumberify("2800000000000000000")],
      [
        bigNumberify("1498500000000000000"),
        expandTo18Decimals(2),
        expandTo18Decimals(2),
        expandTo18Decimals(2),
        expandTo18Decimals(2),
        expandTo18Decimals(2),
        expandTo18Decimals(2),
        expandTo18Decimals(2),
        expandTo18Decimals(2)
      ]
    ])

    limitAmount = expandTo18Decimals(3)
    let result4 = await hybridRouter.getAmountOutForTakePrice(bigNumberify(1), limitAmount, limitPrice, decimal, bigNumberify("1498500000000000000"))
    console.log("amount out with fee:", result4[1].toString())

    await expect(hybridRouter.buyWithToken(limitAmount, limitPrice, tokenBase.address, tokenQuote.address, wallet.address, MaxUint256, overrides))
        .to.emit(tokenQuote, "Transfer").withArgs(wallet.address, orderBook.address, limitAmount)
        .to.emit(tokenBase, "Transfer").withArgs(orderBook.address, wallet.address, result4[1])

    expect((await orderBook.getUserOrders(wallet.address)).length).to.eq(9)
    let order = await orderBook.marketOrders(10);
    printOrder(order)
    order = await orderBook.marketOrders(2);
    printOrder(order)

    quoteBalance = await orderBook.quoteBalance();
    expect(quoteBalance).to.eq(bigNumberify("11991000000000000"))

    expect(currentPrice).to.eq(limitPrice)
    let obs = await hybridRouter.getOrderBook(tokenBase.address, tokenQuote.address, 32);
    printArray(obs[1])
    printArray(obs[2])
    printArray(obs[3])
    printArray(obs[4])

    expect(await hybridRouter.getOrderBook(tokenBase.address, tokenQuote.address, 32)).to.deep.eq([
      currentPrice,
      [limitPrice],
      [bigNumberify("11991000000000000")],
      [
        bigNumberify("2100000000000000000"),
        bigNumberify("2200000000000000000"),
        bigNumberify("2300000000000000000"),
        bigNumberify("2400000000000000000"),
        bigNumberify("2500000000000000000"),
        bigNumberify("2600000000000000000"),
        bigNumberify("2700000000000000000"),
        bigNumberify("2800000000000000000")],
      [
        expandTo18Decimals(2),
        expandTo18Decimals(2),
        expandTo18Decimals(2),
        expandTo18Decimals(2),
        expandTo18Decimals(2),
        expandTo18Decimals(2),
        expandTo18Decimals(2),
        expandTo18Decimals(2)
      ]
    ])
  })
})
