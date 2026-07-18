# 链动小铺商家增强工具

适用于链动小铺商家后台的 Tampermonkey / Violentmonkey 用户脚本。

QQ 交流群：`1076144676`

## 功能

- 货源广场增强搜索、价格/库存筛选和单个或批量一键对接。
- 商品管理按名称、类型、状态、分类和库存筛选。
- 商品按价格升序或降序展示。
- 批量修改商品分类、价格和上下架状态。
- 一键生成商品名称、库存、价格、链接的单行文字报表并复制；字段用 `｜`、商品用 `||` 分隔。

## 安装

1. 安装 Tampermonkey 或 Violentmonkey。
2. 打开 [`ldxp-merchant-toolkit.user.js`](./ldxp-merchant-toolkit.user.js)，点击 Raw 后由脚本管理器安装。
3. 登录链动小铺商家后台并刷新页面。

## 使用页面

- 货源广场：`https://www.ldxp.cn/merchant/my_parent/source_square`
- 商品管理：`https://www.ldxp.cn/merchant/goods/list?is_proxy=1`

批量修改会直接保存到店铺。首次使用建议只选择一个测试商品。

## 隐私与安全

脚本仅请求 `www.ldxp.cn` 的站内 `/merchantApi/` 接口，不会向第三方发送登录令牌或商品数据。

## 许可证

[MIT](./LICENSE)
