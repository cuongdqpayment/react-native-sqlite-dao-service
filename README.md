# 📦 react-native-sqlite-dao-service

Một thư viện mạnh mẽ dành cho React Native, giúp lập trình viên dễ dàng khai báo, quản lý và vận hành các cơ sở dữ liệu SQLite dưới dạng nhiều schema và service rõ ràng, tường minh, mở rộng được. Phù hợp cho các ứng dụng di động độc lập, offline-first, đa vai trò người dùng và đa bảng nghiệp vụ.

> 🔧 Mục tiêu chính:
>
> * Giảm tải việc viết tay xử lý SQLite.
> * Chuẩn hóa cách định nghĩa schema và service.
> * Giao diện lập trình rõ ràng, dễ mở rộng và bảo trì.

## Tính năng

- 🗄️ **Multi-Schema Support**: Quản lý nhiều schema database
- 🔄 **DAO Pattern**: Data Access Object pattern cho clean architecture
- 🛠️ **Service Layer**: Service layer cho business logic
- 📱 **React Native Optimized**: Tối ưu cho React Native
- 🔒 **Type Safety**: Full TypeScript support
- 🚀 **Performance**: Optimized queries và connection pooling
- 📦 **Offline First**: Hoàn toàn offline, không cần internet

## Cài đặt

```bash
npm install react-native-sqlite-dao-service
# hoặc
yarn add react-native-sqlite-dao-service
```

### Cài đặt dependency

```bash
npm install react-native-sqlite-storage
```

Đối với iOS, chạy:
```bash
cd ios && pod install
```
## 🚀 Tính năng nổi bật

* ✅ Định nghĩa schema/tables bằng JSON/TS cấu trúc chuẩn.
* ✅ Tự động tạo DB, mở kết nối theo vai trò người dùng.
* ✅ Giao dịch đa schema (cross-schema transaction).
* ✅ Service lớp cao cho thao tác nghiệp vụ (CRUD, logic).
* ✅ Tự động quản lý kết nối (AppState foreground/background).
* ✅ Registry service toàn cục (`ServiceManager`).
* ✅ Hỗ trợ debug file `.db` trực tiếp trên thiết bị.
* ✅ Dễ dàng kiểm thử và mock service trong unit test.

---

## 📁 Cấu trúc thư viện

```
.
├── DatabaseManager.ts     # Quản lý kết nối DB theo vai trò người dùng
├── SQLiteDAO.ts           # DAO kết nối/execute SQLite thấp tầng
├── BaseService.ts         # Service nghiệp vụ chuẩn
├── ServiceManager.ts      # Registry tất cả service
├── schemaConfigurations/  # Cấu hình schema (tên bảng, fields, khoá...)
└── RoleConfig.ts          # Cấu hình vai trò người dùng
```

---

## 🧱 Thành phần cốt lõi

| Thành phần             | Vai trò chính                                    |
| ---------------------- | ------------------------------------------------ |
| `DatabaseManager`      | Mở, đóng, quản lý DB đa vai trò                  |
| `SQLiteDAO`            | Giao tiếp SQLite ở mức thấp (query, transaction) |
| `BaseService`          | Lớp nghiệp vụ CRUD chuẩn cho mỗi bảng            |
| `ServiceManager`       | Registry services tự động theo schema/table      |
| `schemaConfigurations` | Định nghĩa bảng: tên bảng, field, PK...          |
| `RoleConfig`           | Gán vai trò → nhóm DB cần dùng                   |

---

## 📦 Cài đặt

```bash
npm install react-native-sqlite-dao-service
# hoặc
yarn add react-native-sqlite-dao-service
```

> **Yêu cầu:** `react-native-sqlite-storage` hoặc tương đương cần được link trước.

---

## 🛠️ Cách sử dụng

### 1. Khai báo schema & bảng

```ts
ServiceManager.getInstance().registerSchemas([
  {
    schemaName: 'core',
    defaultPrimaryKeyFields: ['id'],
    defaultServiceClass: BaseService,
    defaultAutoInit: true,
    tables: [
      { tableName: 'users' },
      { tableName: 'stores' },
    ],
  },
]);
```

---

### 2. Khai báo vai trò người dùng

```ts
DatabaseManager.registerRoles([
  {
    roleName: 'admin',
    requiredDatabases: ['core', 'analytics'],
    optionalDatabases: ['reports'],
    priority: 1,
  },
  {
    roleName: 'staff',
    requiredDatabases: ['core'],
  },
]);
```

---

### 3. Khởi tạo toàn bộ DB & service

```ts
await DatabaseManager.initializeAll(); // Tạo DB từ schema
await ServiceManager.getInstance().initAllServices(); // Khởi tạo Service
```

---

### 4. Gán vai trò (khi đăng nhập)

```ts
await DatabaseManager.setCurrentUserRoles(['admin']);
```

---

### 5. Sử dụng Service

```ts
const userService = await ServiceManager.getInstance().getService('core', 'users');
await userService.create({ username: 'admin', password_hash: 'xyz', ... });
```

---

### 6. Giao dịch nhiều bảng/schema

```ts
await ServiceManager.getInstance().executeSchemaTransaction('core', async (services) => {
  const userService = services.get('core:users')!;
  const storeService = services.get('core:stores')!;
  
  await userService.create({ username: 'abc' });
  await storeService.update(...);
});
```

---

## ✨ Tạo Custom Service từ `BaseService`

```ts
export class UserService extends BaseService {
  constructor() {
    super('core', 'users');
  }

  async findByUsername(username: string) {
    const result = await this.findAll({ username });
    return result.length > 0 ? result[0] : null;
  }

  protected _validateData(data: any) {
    if (!data.username) throw new Error('username is required');
  }
}

export const userService = new UserService();
```

---

## 🧪 Kiểm tra trạng thái Service

```ts
const status = ServiceManager.getInstance().getStatus();
const health = await ServiceManager.getInstance().healthCheck();
```

---

## 📤 Logout hoặc thoát ứng dụng

```ts
await ServiceManager.getInstance().closeAllServices();
await DatabaseManager.logout();
```

---

## 📂 Kiểm tra file DB

```ts
await DatabaseManager.debugDatabaseFiles(['core', 'users']);
```

---

## 📌 Ghi chú

* `core` luôn được mở mặc định cho mọi vai trò.
* Vai trò có thể mang nhiều loại DB và chia optional/required.
* Dữ liệu schema/table có thể được định nghĩa động hoặc JSON file.
* Kết nối sẽ được tự động đóng/mở theo trạng thái foreground/background.

---

## 🔮 Hướng phát triển tương lai

* [ ] Hỗ trợ migration tự động theo version schema.
* [ ] Tool convert từ Excel/CSV sang bảng schema nhanh.
* [ ] UI debug schema và dữ liệu mẫu.
* [ ] Plugin đồng bộ dữ liệu từ xa.

---

## 🧠 Kết luận

`react-native-sqlite-dao-service` giúp bạn xây dựng các ứng dụng React Native mạnh mẽ, offline, đa vai trò người dùng và dễ bảo trì. Bằng cách phân tách rõ ràng logic nghiệp vụ và kết nối DB, bạn có thể xây dựng ứng dụng quy mô lớn với kiến trúc sạch, hiện đại và mở rộng dễ dàng.

> ✨ Mẹo: Dùng `ServiceManager` như một DI Container giúp inject logic nghiệp vụ theo bảng một cách linh hoạt, testable và tối ưu cho modular architecture.

---

## Tác giả

**Doan Quoc Cuong**
- Email: cuongdq3500888@gmail.com
- GitHub: [@cuongdqpayment](https://github.com/cuongdqpayment)

## License

MIT
```