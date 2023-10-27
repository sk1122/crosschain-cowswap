import { Mempool } from "@prisma/client";
import axios from "axios"
import { BuildTransactionConfig, Chain, Conditions, TransactionType, buildErc20ApproveTransaction, chainIdToChain } from "../types";
import { getEvmRPC } from "../config";

export const lifiAdapter = async (tx: BuildTransactionConfig): Promise<any[]> => {
    const rpc = getEvmRPC(tx.fromChain);

	const result = await axios.get(`https://li.quest/v1/quote`, {
		params: {
			fromChain: tx.fromChain,
			toChain: tx.toChain,
			fromToken: tx.fromToken,
			toToken: tx.toToken,
			fromAmount: tx.fromAmount,
			fromAddress: tx.fromAddress,
			toAddress: tx.toAddress
		},
	});

	const bridge = result.data;

    const approveTxData = buildErc20ApproveTransaction(bridge.estimate.approvalAddress, tx.fromAmount!)
    const approveTx = {
        from: tx.fromAddress,
        to: tx.fromToken,
        value: 0,
        data: approveTxData,
        gasLimit:
            (
                await rpc.estimateGas({
                    from: tx.fromAddress,
                    to: tx.fromToken,
                    value: 0,
                    data: approveTxData,
                })
            )._hex ?? undefined,
        gasPrice: (await rpc.getGasPrice())._hex,
    }

    const txs = [
        {
            tx: approveTx,
            chain: tx.fromChain,
            type: TransactionType.APPROVE_TOKEN
        },
        {
            tx: bridge.transactionRequest,
            chain: tx.fromChain,
            type: TransactionType.TRANSFER_TOKEN
        }
    ]

    return txs
};

export const solveCrossChain = async (intent: Mempool) => {
    const conditions = JSON.parse(intent.conditions) as Conditions

    const txs = await lifiAdapter({
        fromAddress: conditions.conditions.fromAddress,
        toAddress: conditions.conditions.toAddress,
        fromToken: conditions.conditions.tokenIn,
        toToken: conditions.conditions.tokenOut,
        fromChain: conditions.conditions.chainIn,
        toChain: conditions.conditions.chainOut,
        fromAmount: conditions.conditions.amountIn,
        toAmount: conditions.conditions.amountOut
    })

    return txs
}

export const solveCowSwap = async (intents: Mempool[]) => {
    let cachedOrders: { id: string, buyToken: string, buyChain: Chain, sellToken: string, sellChain: Chain, orderId: string, filled: boolean, fillerOrder?: string }[] = []
    
    for(let i = 0; i < intents.length; i++) {
        const intent = intents[i]
        const conditions = JSON.parse(intent.conditions) as Conditions

        cachedOrders.push({
            id: intent.id,
            buyChain: chainIdToChain(conditions.conditions.chainIn),
            sellChain: chainIdToChain(conditions.conditions.chainOut),
            buyToken: conditions.conditions.tokenIn,
            sellToken: conditions.conditions.tokenOut,
            orderId: intent.id,
            filled: false
        })
    }

    for(let i = 0; i < cachedOrders.length; i++) {
        const ogOrder = cachedOrders[i]
        
        for(let j = 0; j < cachedOrders.length; j++) {
            if(i === j) continue
            const order = cachedOrders[j]

            if(!order.filled) {
                if(order.sellChain === ogOrder.buyChain && order.sellToken === ogOrder.buyToken) {
                    cachedOrders[j].filled = true
                    cachedOrders[j].fillerOrder = ogOrder.id
                }
            }
        }
    }

    console.log(cachedOrders)
}

// solveCowSwap([
//     {
//         id: "1",
//         name: "yoo",
//         description: "",
//         conditions: JSON.stringify({
//             conditions: {
//                 fromAddress: "X",
//                 toAddress: "Y",
//                 amountIn: "1000",
//                 tokenIn: "A",
//                 chainIn: 1,

//                 amountOut: "1000",
//                 tokenOut: "B",
//                 chainOut: 2,

//                 slippage: 0
//             },
//             preConditions: {}
//         }),
//         batch: "1",
//         fee: 1,
//         response: "",
//         typeId: "cow-swap",
//         createdAt: new Date(),
//         signedOrder: "",
//         approved: true,
//         solved: false
//     },
//     {
//         id: "2",
//         name: "yoo",
//         description: "",
//         conditions: JSON.stringify({
//             conditions: {
//                 fromAddress: "Y",
//                 toAddress: "Z",
//                 amountIn: "1000",
//                 tokenIn: "B",
//                 chainIn: 2,

//                 amountOut: "1000",
//                 tokenOut: "C",
//                 chainOut: 3,

//                 slippage: 0
//             },
//             preConditions: {}
//         }),
//         batch: "1",
//         fee: 1,
//         response: "",
//         typeId: "cow-swap",
//         createdAt: new Date(),
//         signedOrder: "",
//         approved: true,
//         solved: false
//     },
//     {
//         id: "3",
//         name: "yoo",
//         description: "",
//         conditions: JSON.stringify({
//             conditions: {
//                 fromAddress: "Z",
//                 toAddress: "X",
//                 amountIn: "1000",
//                 tokenIn: "C",
//                 chainIn: 3,

//                 amountOut: "1000",
//                 tokenOut: "A",
//                 chainOut: 1,

//                 slippage: 0
//             },
//             preConditions: {}
//         }),
//         batch: "1",
//         fee: 1,
//         response: "",
//         typeId: "cow-swap",
//         createdAt: new Date(),
//         signedOrder: "",
//         approved: true,
//         solved: false
//     }
// ])