# 自动为 SlotTest.csv 添加表头脚本
# 运行后会生成 SlotTest_with_header.csv，不会覆盖原文件

header = [
    "type","trade_timestamp","transaction_slot","trader_wallet_address","token_mint_address","signers","signer_balance_changes","buy_direction","buy_currency","buy_amount","buy_from_account_address","buy_to_account_address","buy_price","buy_sol_amount","sell_direction","sell_currency","sell_amount","sell_from_account_address","sell_to_account_address","sell_price","sell_sol_amount","arbitrage_profit_loss","arbitrage_price_change","arbitrage_volume","pool_state_real_token_reserves_pre_reserves","pool_state_real_token_reserves_post_reserves","pool_state_real_token_reserves_change","pool_state_completion_rate","account_creation_account","account_creation_owner","account_creation_created_at","token_creation_mint","token_creation_initial_supply","token_creation_creator","token_creation_decimals","token_creation_symbol","token_creation_name","token_creation_uri","token_creation_metadata_address","token_creation_metadata_name","token_creation_metadata_symbol","token_creation_metadata_uri","token_creation_metadata_twitter_link","token_creation_metadata_discord_link","token_creation_metadata_website_link","add_liquidity_lp_token_mint","add_liquidity_lp_token_amount","add_liquidity_token0_amount","add_liquidity_token1_amount","add_liquidity_token0_account","add_liquidity_token1_account","add_liquidity_token0_address","add_liquidity_token1_address","remove_liquidity_lp_token_mint","remove_liquidity_lp_token_amount","remove_liquidity_token0_amount","remove_liquidity_token1_amount","remove_liquidity_token0_account","remove_liquidity_token1_account","remove_liquidity_token0_address","remove_liquidity_token1_address","net_sol_balance_change","transaction_fee","transaction_signature","reason","source_name","source_program","version"
]

header_line = ','.join(header)

infile = 'SlotTest.csv'
outfile = 'SlotTest_with_header.csv'

with open(infile, 'r', encoding='utf-8') as fin, open(outfile, 'w', encoding='utf-8') as fout:
    fout.write(header_line + '\n')
    for line in fin:
        fout.write(line)

print(f"已生成 {outfile}，请用该文件作为API数据源")
