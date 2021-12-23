import chai, { expect } from 'chai'
import { Contract } from 'ethers'
import { solidity, MockProvider, createFixtureLoader } from 'ethereum-waffle'
import { BigNumber, bigNumberify } from 'ethers/utils'

import { expandTo18Decimals, mineBlock, encodePrice, printOrder } from './shared/utilities'
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

  it('getAmountsForBuy: buy limit price <= start price == end price', async () => {
    await factory.setOrderBookFactory(orderBookFactory.address);
    const minAmount = await orderBook.minAmount()
    expect(minAmount).to.eq(bigNumberify("1000"))
    let limitAmount = expandTo18Decimals(1)
    let currentPrice = await orderBook.getPrice()

    await tokenQuote.transfer(orderBook.address, limitAmount)
    await orderBook.createBuyLimitOrder(wallet.address, expandTo18Decimals(1), wallet.address)

    let order = await orderBook.marketOrders(1);
    expect(order.amountRemain).to.eq(limitAmount)

    await tokenQuote.transfer(orderBook.address, limitAmount)
    await orderBook.createBuyLimitOrder(wallet.address, expandTo18Decimals(2), wallet.address)

    order = await orderBook.marketOrders(2);
    expect(order.amountRemain).to.eq(limitAmount)

    expect(await orderBook.getUserOrders(wallet.address)).to.deep.eq([bigNumberify("1"), bigNumberify("2")])
    expect(await orderBook.getPrice()).to.eq(currentPrice)

    let reserves = await orderBook.getReserves()
    expect(reserves[0]).to.eq(expandTo18Decimals(5))
    expect(reserves[1]).to.eq(expandTo18Decimals(10))

    let amountOffer = bigNumberify("1000000000000000000")
    let price = expandTo18Decimals(1)
    let results = await hybridRouter.getAmountsForBuy(amountOffer, price, tokenBase.address, tokenQuote.address)
    expect(results[0]).to.eq(bigNumberify("0"))
    expect(results[1]).to.eq(bigNumberify("0"))
    expect(results[2]).to.eq(bigNumberify("0"))
    expect(results[3]).to.eq(bigNumberify("0"))
    expect(results[4]).to.eq(bigNumberify("0"))
    expect(results[5]).to.eq(amountOffer)
    expect(results[6]).to.eq(currentPrice)
  })

  it('getAmountsForBuy: start price < end price <= buy limit price', async () => {
    await factory.setOrderBookFactory(orderBookFactory.address);
    let limitAmount = expandTo18Decimals(1)
    let currentPrice = await orderBook.getPrice()

    await tokenQuote.transfer(orderBook.address, limitAmount)
    await orderBook.createBuyLimitOrder(wallet.address, expandTo18Decimals(2), wallet.address, overrides)

    let order = await orderBook.marketOrders(1);
    expect(order.amountRemain).to.eq(limitAmount)
    expect(await orderBook.getUserOrders(wallet.address)).to.deep.eq([bigNumberify("1")])
    expect(await orderBook.getPrice()).to.eq(currentPrice)

    let reserves = await orderBook.getReserves()
    expect(reserves[0]).to.eq(expandTo18Decimals(5))
    expect(reserves[1]).to.eq(expandTo18Decimals(10))

    //limit price == start price
    let amountOffer = bigNumberify("1000000000000000000")
    let price = expandTo18Decimals(2)
    let results = await hybridRouter.getAmountsForBuy(amountOffer, price, tokenBase.address, tokenQuote.address)
    expect(results[0]).to.eq(bigNumberify("0"))
    expect(results[1]).to.eq(bigNumberify("0"))
    expect(results[2]).to.eq(bigNumberify("0"))
    expect(results[3]).to.eq(bigNumberify("0"))
    expect(results[4]).to.eq(bigNumberify("0"))
    expect(results[5]).to.eq(amountOffer)
    expect(results[6]).to.eq(currentPrice)

    //limit price > end price > start price
    amountOffer = bigNumberify("1000000000000000000")
    price = expandTo18Decimals(3)
    results = await hybridRouter.getAmountsForBuy(amountOffer, price, tokenBase.address, tokenQuote.address)
    expect(results[0]).to.eq(bigNumberify(amountOffer)) // amm amount in
    expect(results[1]).to.eq(await hybridRouter.getAmountOut(results[0], reserves[1], reserves[0])) //amm amount out
    expect(results[2]).to.eq(bigNumberify("0")) //order amount in
    expect(results[3]).to.eq(bigNumberify("0")) //order amount out
    expect(results[4]).to.eq(bigNumberify("0")) //fee from order
    expect(results[5]).to.eq(bigNumberify("0")) //amount left
    //price to = (quote reserve + amm amount in) / (base reserve - amm amount out)
    expect(results[6]).to.eq(await hybridRouter.getPrice(reserves[0].sub(results[1]), reserves[1].add(amountOffer), bigNumberify("18")))

    //limit price == end price > start price
    amountOffer = bigNumberify("10000000000000000000")
    price = expandTo18Decimals(3)

    results = await hybridRouter.getAmountForMovePrice(bigNumberify("1"), amountOffer, reserves[0], reserves[1], price, bigNumberify("18"))
    console.log("amount left:", results[0].toString())
    console.log("amount base used:", results[1].toString())
    console.log("amount quote used:", results[2].toString())
    console.log("reserve base:", results[3].toString())
    console.log("reserve quote:", results[4].toString())

    results = await hybridRouter.getAmountsForBuy(amountOffer, price, tokenBase.address, tokenQuote.address)
    console.log("amm amount in:", results[0].toString())
    console.log("amm amount out:", results[1].toString())
    console.log("order amount in:", results[2].toString())
    console.log("order amount out:", results[3].toString())
    console.log("fee from order matching:", results[4].toString())
    console.log("amount left:", results[5].toString())
    console.log("price to:", results[6].toString())
    expect(results[0]).to.eq(bigNumberify("2250825417403555356")) // amm amount in
    expect(results[1]).to.gte(await hybridRouter.getAmountOut(results[0], reserves[1], reserves[0])) //amm amount out
    expect(results[2]).to.eq(bigNumberify("0")) //order amount in
    expect(results[3]).to.eq(bigNumberify("0")) //order amount out
    expect(results[4]).to.eq(bigNumberify("0")) //fee from order
    //expect(results[5]).to.eq(amountOffer.sub(results[0])) //amount left
    //price to = (quote reserve + amm amount in) / (base reserve - amm amount out)
    expect(results[6]).to.eq(await hybridRouter.getPrice(reserves[0].sub(results[1]),
     reserves[1].add(results[0]), bigNumberify("18")))
    expect(results[6]).to.eq(price)
  })

  /*it('getAmountsForBuy: match limit sell order', async () => {
    await factory.setOrderBookFactory(orderBookFactory.address);
    let limitAmount = expandTo18Decimals(1)
    let currentPrice = await orderBook.getPrice()

    await tokenBase.transfer(orderBook.address, limitAmount)
    await orderBook.createSellLimitOrder(wallet.address, expandTo18Decimals(2), wallet.address, overrides)

    let order = await orderBook.marketOrders(1);
    expect(order.amountRemain).to.eq(limitAmount)
    expect(await orderBook.getUserOrders(wallet.address)).to.deep.eq([bigNumberify("1")])
    expect(await orderBook.getPrice()).to.eq(currentPrice)

    let reserves = await orderBook.getReserves()
    expect(reserves[0]).to.eq(expandTo18Decimals(5))
    expect(reserves[1]).to.eq(expandTo18Decimals(10))

    let amountOffer = bigNumberify("1000000000000000000")
    let price = expandTo18Decimals(2)
    let results = await hybridRouter.getAmountsForBuy(amountOffer, price, tokenBase.address, tokenQuote.address)
    console.log("amm amount in:", results[0].toString())
    console.log("amm amount out:", results[1].toString())
    console.log("order amount in:", results[2].toString())
    console.log("order amount out:", results[3].toString())
    console.log("fee from order matching:", results[4].toString())
    console.log("amount left:", results[5].toString())
    console.log("price to:", results[6].toString())
    expect(results[0]).to.eq(bigNumberify("0"))
    expect(results[1]).to.eq(bigNumberify("0"))
    expect(results[2]).to.eq(bigNumberify("0"))
    expect(results[3]).to.eq(bigNumberify("0"))
    expect(results[4]).to.eq(bigNumberify("0"))
    expect(results[5]).to.eq(amountOffer)
    expect(results[6]).to.eq(currentPrice)

    amountOffer = bigNumberify("1000000000000000000")
    price = expandTo18Decimals(3)
    results = await hybridRouter.getAmountsForBuy(amountOffer, price, tokenBase.address, tokenQuote.address)
    console.log("amm amount in:", results[0].toString())
    console.log("amm amount out:", results[1].toString())
    console.log("order amount in:", results[2].toString())
    console.log("order amount out:", results[3].toString())
    console.log("fee from order matching:", results[4].toString())
    console.log("amount left:", results[5].toString())
    console.log("price to:", results[6].toString())
    expect(results[0]).to.eq(bigNumberify(amountOffer)) // amm amount in
    expect(results[1]).to.eq(await hybridRouter.getAmountOut(amountOffer, reserves[1], reserves[0])) //amm amount out
    expect(results[2]).to.eq(bigNumberify("0")) //order amount in
    expect(results[3]).to.eq(bigNumberify("0")) //order amount out
    expect(results[4]).to.eq(bigNumberify("0")) //fee from order
    expect(results[5]).to.eq(bigNumberify("0")) //amount left
    //price to = (quote reserve + amm amount in) / (base reserve - amm amount out)
    expect(results[6]).to.eq(await hybridRouter.getPrice(reserves[0].sub(results[1]), reserves[1].add(amountOffer), bigNumberify("18")))
  })*/

  /*it('getAmountOutForMovePrice down:start price > buy limit order price', async () => {
    await factory.setOrderBookFactory(orderBookFactory.address);
    console.log("price before:", (await orderBook.getPrice()).toString())
    const minAmount = await orderBook.minAmount()
    console.log("minAmount:", minAmount.toString())

    let limitAmount = expandTo18Decimals(1)
    console.log("limitAmount:", limitAmount.toString())

    await tokenQuote.transfer(orderBook.address, limitAmount)
    await orderBook.createBuyLimitOrder(wallet.address, expandTo18Decimals(1), wallet.address)

    let order = await orderBook.marketOrders(1);
    printOrder(order)
    console.log("user orders:", await orderBook.getUserOrders(wallet.address))
    console.log("price after:", (await orderBook.getPrice()).toString())

    let reserves = await orderBook.getReserves()
    console.log("reserve base:", reserves[0].toString())
    console.log("reserve quote:", reserves[1].toString())

    let amountOffer = bigNumberify("1000000000000000000")
    let price = bigNumberify("1000000000000000000")
    let results = await hybridRouter.getAmountsForBuy(amountOffer, price, tokenBase.address, tokenQuote.address)
    console.log("amm amount in:", results[0].toString())
    console.log("amm amount out:", results[1].toString())
    console.log("order amount in:", results[2].toString())
    console.log("order amount out:", results[3].toString())
    console.log("order fee:", results[4].toString())
    console.log("order amount left:", results[5].toString())
    console.log("price to:", results[6].toString())

    amountOffer = bigNumberify("1000000000000000000")
    price = bigNumberify("1000000000000000000")
    results = await hybridRouter.getAmountsForSell(amountOffer, price, tokenBase.address, tokenQuote.address)
    console.log("amm amount in:", results[0].toString())
    console.log("amm amount out:", results[1].toString())
    console.log("order amount in:", results[2].toString())
    console.log("order amount out:", results[3].toString())
    console.log("order fee:", results[4].toString())
    console.log("order amount left:", results[5].toString())
    console.log("price to:", results[6].toString())
    console.log("price after:", (reserves[1].sub(results[1])).mul(bigNumberify("1000000000000000000")).div(reserves[0].add(results[0])).toString())
  })*/

  //实际情况不存在start price < buy limit order price的情况
})
