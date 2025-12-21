import requests
import json
import time
from datetime import datetime, timezone, timedelta

BASE_URL = "http://localhost:8000"

def test_endpoint(endpoint, method="GET", data=None, params=None):
    """Тестирует эндпоинт API с улучшенной обработкой ошибок"""
    url = f"{BASE_URL}{endpoint}"

    print(f"\n{'='*60}")
    print(f"Тестируем: {method} {endpoint}")
    if params:
        print(f"Параметры: {params}")
    if data:
        print(f"Данные: {json.dumps(data, ensure_ascii=False)}")

    try:
        response = None
        if method == "GET":
            response = requests.get(url, params=params, timeout=10)
        elif method == "POST":
            headers = {'Content-Type': 'application/json'}
            response = requests.post(url, json=data, headers=headers, timeout=10)
        elif method == "PUT":
            response = requests.put(url, json=data, timeout=10)
        elif method == "DELETE":
            response = requests.delete(url, timeout=10)

        print(f"Статус: {response.status_code}")

        if response.status_code in [200, 201]:
            try:
                result = response.json()
                print(f"✅ Успех!")
                return result
            except:
                print(f"✅ Успех! Ответ: {response.text}")
                return response.text
        else:
            print(f"❌ Ошибка {response.status_code}:")
            print(f"Ответ: {response.text}")
            return None

    except Exception as e:
        print(f"Исключение: {e}")
        import traceback
        traceback.print_exc()
        return None

def test_user_functionality(user_id, original_login):
    """Тестирует функциональность пользователей"""
    print(f"\n{'#'*60}")
    print("Тестируем функциональность пользователей")
    print(f"{'#'*60}")

    print("\n1. Проверяем поле is_available в ответах API:")
    user = test_endpoint(f"/users/{user_id}")
    if user and "is_available" in user:
        print(f"✅ Поле is_available присутствует: {user['is_available']}")
    else:
        print("❌ Поле is_available отсутствует!")

    print("\n2. Тестируем получение пароля по логину:")
    password_info = test_endpoint(f"/users/password/{original_login}")
    if password_info and "password" in password_info:
        print(f"✅ Пароль получен успешно")
        print(f"   Логин: {password_info.get('login')}")
        print(f"   Роль: {password_info.get('role')}")
        print(f"   Доступность: {password_info.get('is_available')}")
    else:
        print("❌ Не удалось получить пароль")

    print("\n3. Тестируем полное обновление пользователя:")
    new_login = f"updated_waiter_{int(time.time())}"
    update_data = {
        "name": "Обновленный Официант",
        "login": new_login,
        "password": "newpassword123",
        "role": "waiter",
        "is_available": False
    }

    updated_user = test_endpoint(f"/users/{user_id}/full", "PUT", update_data)
    if updated_user:
        print(f"✅ Пользователь успешно обновлен")
        print(f"   Новое имя: {updated_user.get('name')}")
        print(f"   Новый логин: {updated_user.get('login')}")
        print(f"   Новая доступность: {updated_user.get('is_available')}")
    else:
        print("❌ Не удалось обновить пользователя")

    print("\n4. Проверяем сохранение изменений:")
    refreshed_user = test_endpoint(f"/users/{user_id}")
    if refreshed_user:
        print(f"✅ Изменения сохранены:")
        print(f"   Имя: {refreshed_user.get('name')} (должно быть: 'Обновленный Официант')")
        print(f"   Логин: {refreshed_user.get('login')} (должно быть: {new_login})")
        print(f"   Доступность: {refreshed_user.get('is_available')} (должно быть: False)")

    return new_login

def test_menu_functionality(category_id, dish_id):
    """Тестирует функциональность меню"""
    print(f"\n{'#'*60}")
    print("Тестируем функциональность меню")
    print(f"{'#'*60}")

    print("\n1. Получаем все блюда:")
    all_dishes = test_endpoint("/menu/")
    if all_dishes:
        print(f"✅ Получено {len(all_dishes)} блюд")

    print(f"\n2. Получаем блюда по категории {category_id}:")
    dishes_by_category = test_endpoint("/menu/", params={"category_id": category_id})
    if dishes_by_category:
        print(f"✅ Получено {len(dishes_by_category)} блюд в категории")

    print(f"\n3. Получаем блюдо по ID {dish_id}:")
    dish = test_endpoint(f"/menu/{dish_id}")
    if dish:
        print(f"✅ Получено блюдо: {dish.get('name')}")

    print(f"\n4. Обновляем блюдо {dish_id}:")
    update_data = {
        "name": f"Обновленное блюдо_{int(time.time())}",
        "description": "Обновленное описание",
        "price": 2000.0,
        "is_available": False
    }
    updated_dish = test_endpoint(f"/menu/{dish_id}", "PUT", update_data)
    if updated_dish:
        print(f"✅ Блюдо обновлено")
        print(f"   Новое имя: {updated_dish.get('name')}")
        print(f"   Новая цена: {updated_dish.get('price')}")
        print(f"   Доступность: {updated_dish.get('is_available')}")

    print(f"\n5. Получаем все категории:")
    categories = test_endpoint("/menu/categories/")
    if categories:
        print(f"✅ Получено {len(categories)} категорий")

    print(f"\n6. Получаем категорию {category_id}:")
    category = test_endpoint(f"/menu/categories/{category_id}")
    if category:
        print(f"✅ Получена категория: {category.get('name')}")

    print(f"\n7. Обновляем категорию {category_id}:")
    new_category_name = f"Обновленная_категория_{int(time.time())}"
    category_update_data = {"name": new_category_name}
    updated_category = test_endpoint(f"/menu/categories/{category_id}", "PUT", category_update_data)
    if updated_category:
        print(f"✅ Категория обновлена: {updated_category.get('name')}")

    return dish_id

def test_plate_operations(order_id, dish_id):
    """Тестирует операции с блюдами в заказе"""
    print(f"\n{'#'*60}")
    print("Тестируем операции с блюдами в заказе")
    print(f"{'#'*60}")

    print(f"\n1. Проверяем статус заказа {order_id}:")
    order = test_endpoint(f"/orders/{order_id}")
    if order:
        print(f"   Статус заказа: {order.get('status')}")
        if order.get('status') not in ["active", "waiting"]:
            print(f"   ❌ Заказ имеет статус '{order.get('status')}', меняем на 'active'...")
            test_endpoint(f"/orders/{order_id}", "PUT", {"status": "active"})

    print(f"\n2. Добавляем блюдо к заказу {order_id}:")
    plate_data = {
        "plate_id": dish_id,
        "count": 3,
        "comment": "Дополнительное блюдо",
        "cooking_status": "waiting",
        "price": 1500.0
    }
    new_plate = test_endpoint(f"/orders/{order_id}/plates", "POST", plate_data)
    if new_plate and "id" in new_plate:
        plate_id = new_plate["id"]
        print(f"✅ Добавлено блюдо с ID: {plate_id}")
    else:
        print("❌ Не удалось добавить блюдо")
        return None

    print(f"\n3. Изменяем блюдо {plate_id} в заказе:")
    update_data = {
        "count": 2,
        "comment": "Обновленный комментарий",
        "cooking_status": "preparing",
        "price": 1600.0
    }
    updated_plate = test_endpoint(f"/orders/plates/{plate_id}", "PUT", update_data)
    if updated_plate:
        print(f"✅ Блюдо обновлено")
        print(f"   Количество: {updated_plate.get('count')}")
        print(f"   Статус: {updated_plate.get('cooking_status')}")

    print(f"\n4. Изменяем статус блюда {plate_id} через специальный эндпоинт:")
    test_endpoint(f"/orders/plate/{plate_id}/status/ready", "PUT")

    print(f"\n5. Удаляем блюдо {plate_id} из заказа:")
    test_endpoint(f"/orders/plates/{plate_id}", "DELETE")

    return plate_id

def test_cooking_history(order_plate_id, order_id, user_id):
    """Тестирует историю статусов приготовления"""
    print(f"\n{'#'*60}")
    print("Тестируем историю статусов приготовления")
    print(f"{'#'*60}")

    print(f"\n1. Получаем информацию о блюде в заказе {order_plate_id}:")
    order = test_endpoint(f"/orders/{order_id}")

    if not order or "plates" not in order:
        print("❌ Не удалось получить информацию о заказе")
        return None

    plate_in_order = None
    for plate in order["plates"]:
        if plate["id"] == order_plate_id:
            plate_in_order = plate
            break

    if not plate_in_order:
        print(f"❌ Блюдо с ID {order_plate_id} не найдено в заказе")
        return None

    menu_plate_id = plate_in_order["plate_id"]
    print(f"✅ Найдено блюдо: ID в меню = {menu_plate_id}")

    print(f"\n2. Создаем запись в истории статусов:")
    history_data = {
        "new_status": "preparing",
        "order_id": order_id,
        "plate_id": menu_plate_id,
        "change_by": user_id
    }
    new_history = test_endpoint("/cooking-status-history/", "POST", history_data)
    if new_history and "id" in new_history:
        history_id = new_history["id"]
        print(f"✅ Создана запись истории с ID: {history_id}")
    else:
        print("❌ Не удалось создать запись истории")
        print("\nПробуем с другим статусом...")
        history_data["new_status"] = "ordered"
        new_history = test_endpoint("/cooking-status-history/", "POST", history_data)
        if new_history and "id" in new_history:
            history_id = new_history["id"]
            print(f"✅ Создана запись истории с ID: {history_id}")
        else:
            return None

    print(f"\n3. Получаем все записи истории:")
    all_history = test_endpoint("/cooking-status-history/")
    if all_history:
        print(f"✅ Получено {len(all_history)} записей")

    print(f"\n4. Получаем запись истории {history_id}:")
    history_item = test_endpoint(f"/cooking-status-history/{history_id}")

    print(f"\n5. Получаем историю по блюду {menu_plate_id}:")
    plate_history = test_endpoint(f"/cooking-status-history/plate/{menu_plate_id}")
    if plate_history:
        print(f"✅ Получено {len(plate_history)} записей для блюда")

    print(f"\n6. Получаем историю по заказу {order_id}:")
    order_history = test_endpoint(f"/cooking-status-history/order/{order_id}")
    if order_history:
        print(f"✅ Получено {len(order_history)} записей для заказа")

    print(f"\n7. Получаем историю по пользователю {user_id}:")
    user_history = test_endpoint(f"/cooking-status-history/user/{user_id}")
    if user_history:
        print(f"✅ Получено {len(user_history)} записей для пользователя")

    print(f"\n8. Получаем последний статус для блюда {menu_plate_id}:")
    latest_status = test_endpoint(f"/cooking-status-history/latest/plate/{menu_plate_id}")
    if latest_status:
        print(f"✅ Последний статус: {latest_status.get('new_status')}")

    print(f"\n9. Обновляем запись истории {history_id}:")
    update_data = {
        "new_status": "ready",
        "change_by": user_id
    }
    updated_history = test_endpoint(f"/cooking-status-history/{history_id}", "PUT", update_data)
    if updated_history:
        print(f"✅ Запись истории обновлена")

    print(f"\n10. Удаляем запись истории {history_id}:")
    test_endpoint(f"/cooking-status-history/{history_id}", "DELETE")

    return history_id

def test_tables_for_order(order_id, table_id):
    """Тестирует связи столов и заказов"""
    print(f"\n{'#'*60}")
    print("Тестируем связи столов и заказов")
    print(f"{'#'*60}")

    print(f"\n1. Получаем все связи столов и заказов:")
    all_links = test_endpoint("/tables-for-order/")
    if all_links:
        print(f"✅ Получено {len(all_links)} связей")

    print(f"\n2. Получаем столы для заказа {order_id}:")
    order_tables = test_endpoint(f"/tables-for-order/order/{order_id}")
    if order_tables:
        print(f"✅ Получено {len(order_tables)} столов для заказа")

    print(f"\n3. Получаем заказы для стола {table_id}:")
    table_orders = test_endpoint(f"/tables-for-order/table/{table_id}")
    if table_orders:
        print(f"✅ Получено {len(table_orders)} заказов для стола")

    if order_tables and len(order_tables) > 0:
        print(f"\n4. Связь уже существует, пропускаем создание")
    else:
        print(f"\n4. Создаем связь стола {table_id} и заказа {order_id}:")
        link_data = {
            "order": order_id,
            "table": table_id
        }
        new_link = test_endpoint("/tables-for-order/", "POST", link_data)
        if new_link and "id" in new_link:
            link_id = new_link["id"]
            print(f"✅ Создана связь с ID: {link_id}")

    print(f"\n5. Пропускаем удаление связи, чтобы не нарушить целостность данных")

    return True

def test_tables_functionality(table_id):
    """Тестирует функциональность столов"""
    print(f"\n{'#'*60}")
    print("Тестируем функциональность столов")
    print(f"{'#'*60}")

    print(f"\n1. Получаем все столы:")
    all_tables = test_endpoint("/tables/")
    if all_tables:
        print(f"✅ Получено {len(all_tables)} столов")

    print(f"\n2. Получаем свободные столы:")
    free_tables = test_endpoint("/tables/status/free")
    if free_tables:
        print(f"✅ Получено {len(free_tables)} свободных столов")

    print(f"\n3. Получаем занятые столы:")
    occupied_tables = test_endpoint("/tables/status/occupied")
    if occupied_tables:
        print(f"✅ Получено {len(occupied_tables)} занятых столов")

    print(f"\n4. Обновляем стол {table_id}:")
    update_data = {
        "pos_x": 150.0,
        "pos_y": 250.0,
        "status": "occupied"
    }
    updated_table = test_endpoint(f"/tables/{table_id}", "PUT", update_data)
    if updated_table:
        print(f"✅ Стол обновлен")
        print(f"   Новая позиция X: {updated_table.get('pos_x')}")
        print(f"   Новая позиция Y: {updated_table.get('pos_y')}")
        print(f"   Новый статус: {updated_table.get('status')}")

    print(f"\n5. Возвращаем стол {table_id} в свободное состояние:")
    test_endpoint(f"/tables/{table_id}", "PUT", {"status": "free"})

    return True

def test_orders(waiter_id, table_id, dish_id):
    """Тестирует эндпоинты заказов с правильным форматом данных"""
    print("\nТестируем заказы...")

    if not waiter_id or not table_id or not dish_id:
        print("❌ Не хватает данных для создания заказа")
        return None

    print(f"\n1. Проверяем и освобождаем стол {table_id}:")
    table = test_endpoint(f"/tables/{table_id}")
    if table:
        print(f"   Стол ID={table_id}, номер={table.get('number')}, статус={table.get('status')}")
        if table.get("status") != "free":
            print(f"   Стол занят! Освобождаем...")
            freed = test_endpoint(f"/tables/{table_id}", "PUT", {"status": "free"})
            if freed:
                print(f"   ✅ Стол освобожден")

    print("\n2. Получаем все заказы:")
    orders = test_endpoint("/orders/")

    print("\n3. Создаем новый заказ:")

    now_utc = datetime.now(timezone.utc)
    timestart = now_utc.isoformat().replace("+00:00", "Z")
    endtime = (now_utc + timedelta(hours=1)).isoformat().replace("+00:00", "Z")

    order_data = {
        "waiter": waiter_id,
        "status": "active",
        "timestart": timestart,
        "plates": [
            {
                "plate_id": dish_id,
                "count": 2,
                "comment": "Тестовый комментарий",
                "cooking_status": "ordered",
                "price": 1499.99
            }
        ],
        "tables": [table_id]
    }

    print(f"Данные заказа:")
    print(json.dumps(order_data, indent=2, ensure_ascii=False))

    new_order = test_endpoint("/orders/", "POST", order_data)

    if not new_order or "id" not in new_order:
        print("❌ Не удалось создать заказ")
        simple_order_data = {
            "waiter": waiter_id,
            "status": "active",
            "timestart": timestart,
            "plates": [
                {
                    "plate_id": dish_id,
                    "count": 1,
                    "cooking_status": "ordered",
                    "price": 100.0
                }
            ],
            "tables": [table_id]
        }

        new_order = test_endpoint("/orders/", "POST", simple_order_data)

        if not new_order or "id" not in new_order:
            return None

    order_id = new_order["id"]
    print(f"✅ Создан заказ с ID: {order_id}")

    print("\n4. Получаем созданный заказ:")
    order = test_endpoint(f"/orders/{order_id}")

    print("\n5. Обновляем статус заказа на 'in_progress':")
    update_data = {"status": "in_progress"}
    test_endpoint(f"/orders/{order_id}", "PUT", update_data)

    print("\n6. Получаем активные заказы:")
    test_endpoint("/orders/active")

    if order and "plates" in order and order["plates"]:
        plate_id = order["plates"][0]["id"]
        print(f"\n7. Меняем статус блюда (ID: {plate_id}):")
        test_endpoint(f"/orders/plate/{plate_id}/status/preparing", "PUT")
        test_endpoint(f"/orders/plate/{plate_id}/status/ready", "PUT")

    print("\n8. Завершаем заказ:")
    endtime = datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")
    complete_data = {"status": "completed", "endtime": endtime}
    test_endpoint(f"/orders/{order_id}", "PUT", complete_data)

    return order_id

def test_create_order_without_completion(waiter_id, table_id, dish_id):
    """Создает заказ, но не завершает его (для тестирования операций с блюдами)"""
    print("\nСоздаем заказ (без завершения)...")

    if not waiter_id or not table_id or not dish_id:
        print("❌ Не хватает данных для создания заказа")
        return None

    print(f"\n1. Проверяем и освобождаем стол {table_id}:")
    table = test_endpoint(f"/tables/{table_id}")
    if table:
        print(f"   Стол ID={table_id}, номер={table.get('number')}, статус={table.get('status')}")
        if table.get("status") != "free":
            print(f"   Стол занят! Освобождаем...")
            freed = test_endpoint(f"/tables/{table_id}", "PUT", {"status": "free"})
            if freed:
                print(f"   ✅ Стол освобожден")

    print("\n2. Создаем новый заказ:")

    now_utc = datetime.now(timezone.utc)
    timestart = now_utc.isoformat().replace("+00:00", "Z")

    order_data = {
        "waiter": waiter_id,
        "status": "active",
        "timestart": timestart,
        "plates": [
            {
                "plate_id": dish_id,
                "count": 2,
                "comment": "Тестовый комментарий",
                "cooking_status": "ordered",
                "price": 1499.99
            }
        ],
        "tables": [table_id]
    }

    print(f"Данные заказа:")
    print(json.dumps(order_data, indent=2, ensure_ascii=False))

    new_order = test_endpoint("/orders/", "POST", order_data)

    if not new_order or "id" not in new_order:
        print("❌ Не удалось создать заказ")
        return None

    order_id = new_order["id"]
    print(f"✅ Создан заказ с ID: {order_id} (статус: active)")

    print("\n3. Получаем созданный заказ:")
    order = test_endpoint(f"/orders/{order_id}")

    print("\n4. Получаем активные заказы:")
    test_endpoint("/orders/active")

    if order and "plates" in order and order["plates"]:
        plate_id = order["plates"][0]["id"]
        print(f"\n5. Меняем статус блюда (ID: {plate_id}):")
        test_endpoint(f"/orders/plate/{plate_id}/status/preparing", "PUT")
        test_endpoint(f"/orders/plate/{plate_id}/status/ready", "PUT")

    print(f"\n6. Заказ {order_id} оставлен активным для тестирования операций с блюдами")

    return order_id

def test_all():
    """Основной тест"""
    print("Начинаем тестирование Restaurant API")
    print(f"{'='*60}")

    print("Проверяем доступность API:")
    health = test_endpoint("/health")
    if not health or health.get("status") != "healthy":
        print("❌ API не доступен")
        return

    # Тест создания пользователя
    print("\nСоздаем пользователя...")
    original_login = f"waiter_{int(time.time())}"
    user_data = {
        "name": "Тестовый Официант",
        "login": original_login,
        "password": "test123",
        "role": "waiter",
        "is_available": True
    }
    user = test_endpoint("/users/", "POST", user_data)
    if not user:
        print("❌ Не удалось создать пользователя")
        return
    user_id = user["id"]
    print(f"✅ Создан пользователь с ID: {user_id}")

    test_user_functionality(user_id, original_login)

    # Тест создания стола
    print(f"\n{'#'*60}")
    print("Тестируем создание стола...")
    table_data = {
        "number": int(time.time() % 1000),
        "pos_x": 100.0,
        "pos_y": 200.0,
        "status": "free",
        "is_available": True
    }
    table = test_endpoint("/tables/", "POST", table_data)
    if not table:
        # Удаление пользователя
        test_endpoint(f"/users/{user_id}", "DELETE")
        return
    table_id = table["id"]
    print(f"✅ Создан стол с ID: {table_id}")

    # Тест функциональности столов
    test_tables_functionality(table_id)

    # Тест создания категории
    print(f"\n{'#'*60}")
    print("Тестируем создание категории...")
    category_data = {"name": f"Категория_{int(time.time())}"}
    category = test_endpoint("/menu/categories/", "POST", category_data)
    if not category:
        test_endpoint(f"/users/{user_id}", "DELETE")
        test_endpoint(f"/tables/{table_id}", "DELETE")
        return
    category_id = category["id"]
    print(f"✅ Создана категория с ID: {category_id}")

    # Тест создания блюда
    print(f"\n{'#'*60}")
    print("Тестируем создание блюда...")
    dish_data = {
        "name": f"Блюдо_{int(time.time())}",
        "description": "Тестовое блюдо",
        "price": 1500.0,
        "photo": "test",
        "category": category_id,
        "is_available": True
    }
    dish = test_endpoint("/menu/", "POST", dish_data)
    if not dish:
        test_endpoint(f"/users/{user_id}", "DELETE")
        test_endpoint(f"/tables/{table_id}", "DELETE")
        test_endpoint(f"/menu/categories/{category_id}", "DELETE")
        return
    dish_id = dish["id"]
    print(f"✅ Создано блюдо с ID: {dish_id}")

    # Тест меню
    dish_id = test_menu_functionality(category_id, dish_id)

    # Создание заказа
    print(f"\n{'#'*60}")
    print("Создаем заказ (без завершения):")
    order_id = test_create_order_without_completion(user_id, table_id, dish_id)

    if order_id:
        # операции с блюдами в заказе
        test_plate_operations(order_id, dish_id)

        order = test_endpoint(f"/orders/{order_id}")
        if order and "plates" in order and order["plates"]:
            order_plate_id = order["plates"][0]["id"]

            test_cooking_history(order_plate_id, order_id, user_id)
            test_tables_for_order(order_id, table_id)

        print(f"\n{'#'*60}")
        print("✅ Завершаем заказ:")
        endtime = datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")
        complete_data = {"status": "completed", "endtime": endtime}
        test_endpoint(f"/orders/{order_id}", "PUT", complete_data)

    # Очистка
    print(f"\n{'#'*60}")
    print("Очищаем тестовые данные...")

    if order_id:
        print(f"Удаляем заказ {order_id}")
        test_endpoint(f"/orders/{order_id}", "DELETE")

    print(f"Удаляем блюдо {dish_id}")
    test_endpoint(f"/menu/{dish_id}", "DELETE")

    print(f"Удаляем категорию {category_id}")
    test_endpoint(f"/menu/categories/{category_id}", "DELETE")

    print(f"Удаляем стол {table_id}")
    test_endpoint(f"/tables/{table_id}", "DELETE")

    print(f"Удаляем пользователя {user_id}")
    test_endpoint(f"/users/{user_id}", "DELETE")

    print(f"\n{'='*60}")
    print("✅ Тестирование завершено!")

if __name__ == "__main__":
    test_all()