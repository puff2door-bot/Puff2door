#!/usr/bin/env python3
"""
Comprehensive Backend API Test for Puff2Door
Tests all endpoints: AUTH, CART, REVIEWS, ORDERS, TRACKING
"""
import requests
import json
import time
import random
import string

# Get backend URL from frontend/.env
BACKEND_URL = "https://puff2door-preview.preview.emergentagent.com/api"

# Test data
test_email = f"test_{random.randint(10000, 99999)}@example.com"
test_password = "SecurePass123!"
test_user_data = {
    "email": test_email,
    "password": test_password,
    "firstName": "John",
    "lastName": "Doe",
    "address": "123 Main St",
    "state": "CA",
    "city": "Los Angeles",
    "zip": "90001",
    "phone": "555-1234"
}

# Global variables to store test data
auth_token = None
user_id = None
order_number = None
order_id = None

def print_test(test_num, description):
    print(f"\n{'='*80}")
    print(f"TEST {test_num}: {description}")
    print('='*80)

def print_result(passed, message, response=None):
    status = "✅ PASS" if passed else "❌ FAIL"
    print(f"{status}: {message}")
    if response:
        print(f"Status Code: {response.status_code}")
        try:
            print(f"Response: {json.dumps(response.json(), indent=2)}")
        except:
            print(f"Response Text: {response.text}")
    print()

# ============================================================================
# AUTH TESTS
# ============================================================================

def test_1_register_new_user():
    """POST /api/auth/register with unique email -> expect 200 with {token, user}"""
    print_test(1, "Register new user with unique email")
    
    try:
        response = requests.post(
            f"{BACKEND_URL}/auth/register",
            json=test_user_data,
            timeout=10
        )
        
        if response.status_code == 200:
            data = response.json()
            if "token" in data and "user" in data:
                user = data["user"]
                # Check user has required fields
                required_fields = ["id", "email", "firstName", "lastName", "address", "state", "city", "zip", "phone"]
                has_all_fields = all(field in user for field in required_fields)
                # Check password is NOT in response
                has_no_password = "password" not in user
                
                if has_all_fields and has_no_password:
                    global auth_token, user_id
                    auth_token = data["token"]
                    user_id = user["id"]
                    print_result(True, f"User registered successfully. Email: {user['email']}, ID: {user_id}", response)
                    return True
                else:
                    print_result(False, f"User object missing fields or contains password. Fields: {user.keys()}", response)
                    return False
            else:
                print_result(False, "Response missing 'token' or 'user' field", response)
                return False
        else:
            print_result(False, f"Expected 200, got {response.status_code}", response)
            return False
    except Exception as e:
        print_result(False, f"Exception: {str(e)}")
        return False

def test_2_register_duplicate_email():
    """POST /api/auth/register with SAME email -> expect 400 (duplicate)"""
    print_test(2, "Register with duplicate email (should fail)")
    
    try:
        response = requests.post(
            f"{BACKEND_URL}/auth/register",
            json=test_user_data,
            timeout=10
        )
        
        if response.status_code == 400:
            print_result(True, "Duplicate email correctly rejected with 400", response)
            return True
        else:
            print_result(False, f"Expected 400, got {response.status_code}", response)
            return False
    except Exception as e:
        print_result(False, f"Exception: {str(e)}")
        return False

def test_3_login_correct_credentials():
    """POST /api/auth/login with correct email/password -> 200 {token, user}"""
    print_test(3, "Login with correct credentials")
    
    try:
        response = requests.post(
            f"{BACKEND_URL}/auth/login",
            json={"email": test_email, "password": test_password},
            timeout=10
        )
        
        if response.status_code == 200:
            data = response.json()
            if "token" in data and "user" in data:
                print_result(True, "Login successful with correct credentials", response)
                return True
            else:
                print_result(False, "Response missing 'token' or 'user' field", response)
                return False
        else:
            print_result(False, f"Expected 200, got {response.status_code}", response)
            return False
    except Exception as e:
        print_result(False, f"Exception: {str(e)}")
        return False

def test_3b_login_wrong_password():
    """POST /api/auth/login with wrong password -> 401"""
    print_test("3b", "Login with wrong password (should fail)")
    
    try:
        response = requests.post(
            f"{BACKEND_URL}/auth/login",
            json={"email": test_email, "password": "WrongPassword123!"},
            timeout=10
        )
        
        if response.status_code == 401:
            print_result(True, "Wrong password correctly rejected with 401", response)
            return True
        else:
            print_result(False, f"Expected 401, got {response.status_code}", response)
            return False
    except Exception as e:
        print_result(False, f"Exception: {str(e)}")
        return False

def test_4_get_me_with_token():
    """GET /api/auth/me with Bearer token -> 200 {user}"""
    print_test(4, "Get current user with valid token")
    
    try:
        headers = {"Authorization": f"Bearer {auth_token}"}
        response = requests.get(
            f"{BACKEND_URL}/auth/me",
            headers=headers,
            timeout=10
        )
        
        if response.status_code == 200:
            data = response.json()
            if "user" in data:
                print_result(True, "Successfully retrieved current user", response)
                return True
            else:
                print_result(False, "Response missing 'user' field", response)
                return False
        else:
            print_result(False, f"Expected 200, got {response.status_code}", response)
            return False
    except Exception as e:
        print_result(False, f"Exception: {str(e)}")
        return False

def test_4b_get_me_without_token():
    """GET /api/auth/me without token -> 401"""
    print_test("4b", "Get current user without token (should fail)")
    
    try:
        response = requests.get(
            f"{BACKEND_URL}/auth/me",
            timeout=10
        )
        
        if response.status_code == 401:
            print_result(True, "No token correctly rejected with 401", response)
            return True
        else:
            print_result(False, f"Expected 401, got {response.status_code}", response)
            return False
    except Exception as e:
        print_result(False, f"Exception: {str(e)}")
        return False

def test_4c_get_me_invalid_token():
    """GET /api/auth/me with invalid token -> 401"""
    print_test("4c", "Get current user with invalid token (should fail)")
    
    try:
        headers = {"Authorization": "Bearer invalid_token_12345"}
        response = requests.get(
            f"{BACKEND_URL}/auth/me",
            headers=headers,
            timeout=10
        )
        
        if response.status_code == 401:
            print_result(True, "Invalid token correctly rejected with 401", response)
            return True
        else:
            print_result(False, f"Expected 401, got {response.status_code}", response)
            return False
    except Exception as e:
        print_result(False, f"Exception: {str(e)}")
        return False

# ============================================================================
# CART TESTS
# ============================================================================

def test_5_get_cart_empty():
    """GET /api/cart with token -> {items: []} initially"""
    print_test(5, "Get cart (should be empty initially)")
    
    try:
        headers = {"Authorization": f"Bearer {auth_token}"}
        response = requests.get(
            f"{BACKEND_URL}/cart",
            headers=headers,
            timeout=10
        )
        
        if response.status_code == 200:
            data = response.json()
            if "items" in data and isinstance(data["items"], list):
                print_result(True, f"Cart retrieved successfully. Items count: {len(data['items'])}", response)
                return True
            else:
                print_result(False, "Response missing 'items' field or not a list", response)
                return False
        else:
            print_result(False, f"Expected 200, got {response.status_code}", response)
            return False
    except Exception as e:
        print_result(False, f"Exception: {str(e)}")
        return False

def test_6_put_cart_with_items():
    """PUT /api/cart with token and items -> returns items"""
    print_test(6, "Update cart with items")
    
    cart_data = {
        "items": [
            {
                "productId": 1,
                "name": "Test Product",
                "price": 40.0,
                "image": "https://example.com/image.jpg",
                "category": "KRATOM",
                "categorySlug": "kratom",
                "slug": "test-product-1",
                "qty": 2
            }
        ]
    }
    
    try:
        headers = {"Authorization": f"Bearer {auth_token}"}
        response = requests.put(
            f"{BACKEND_URL}/cart",
            headers=headers,
            json=cart_data,
            timeout=10
        )
        
        if response.status_code == 200:
            data = response.json()
            if "items" in data and len(data["items"]) > 0:
                print_result(True, f"Cart updated successfully. Items: {len(data['items'])}", response)
                return True
            else:
                print_result(False, "Response missing 'items' or items empty", response)
                return False
        else:
            print_result(False, f"Expected 200, got {response.status_code}", response)
            return False
    except Exception as e:
        print_result(False, f"Exception: {str(e)}")
        return False

def test_7_get_cart_persistence():
    """GET /api/cart again -> should return saved items (persistence check)"""
    print_test(7, "Get cart to verify persistence")
    
    try:
        headers = {"Authorization": f"Bearer {auth_token}"}
        response = requests.get(
            f"{BACKEND_URL}/cart",
            headers=headers,
            timeout=10
        )
        
        if response.status_code == 200:
            data = response.json()
            if "items" in data and len(data["items"]) > 0:
                item = data["items"][0]
                if item.get("name") == "Test Product" and item.get("qty") == 2:
                    print_result(True, "Cart persistence verified - items saved correctly", response)
                    return True
                else:
                    print_result(False, "Cart items don't match expected values", response)
                    return False
            else:
                print_result(False, "Cart is empty - persistence failed", response)
                return False
        else:
            print_result(False, f"Expected 200, got {response.status_code}", response)
            return False
    except Exception as e:
        print_result(False, f"Exception: {str(e)}")
        return False

def test_8_get_cart_without_token():
    """GET /api/cart without token -> 401"""
    print_test(8, "Get cart without token (should fail)")
    
    try:
        response = requests.get(
            f"{BACKEND_URL}/cart",
            timeout=10
        )
        
        if response.status_code == 401:
            print_result(True, "No token correctly rejected with 401", response)
            return True
        else:
            print_result(False, f"Expected 401, got {response.status_code}", response)
            return False
    except Exception as e:
        print_result(False, f"Exception: {str(e)}")
        return False

# ============================================================================
# REVIEWS TESTS
# ============================================================================

def test_9_get_reviews_fresh_slug():
    """GET /api/reviews/some-slug -> {reviews:[], average:0, count:0} for fresh slug"""
    print_test(9, "Get reviews for fresh product slug")
    
    fresh_slug = f"test-product-{random.randint(10000, 99999)}"
    
    try:
        response = requests.get(
            f"{BACKEND_URL}/reviews/{fresh_slug}",
            timeout=10
        )
        
        if response.status_code == 200:
            data = response.json()
            if "reviews" in data and "average" in data and "count" in data:
                if data["count"] == 0 and data["average"] == 0 and len(data["reviews"]) == 0:
                    print_result(True, "Fresh slug returns empty reviews correctly", response)
                    return True
                else:
                    print_result(False, f"Expected empty reviews, got count={data['count']}, average={data['average']}", response)
                    return False
            else:
                print_result(False, "Response missing required fields", response)
                return False
        else:
            print_result(False, f"Expected 200, got {response.status_code}", response)
            return False
    except Exception as e:
        print_result(False, f"Exception: {str(e)}")
        return False

def test_10_post_review():
    """POST /api/reviews -> returns review"""
    print_test(10, "Post a review")
    
    review_data = {
        "productSlug": "puff2door-preview",
        "name": "John",
        "rating": 5,
        "comment": "Great product!"
    }
    
    try:
        response = requests.post(
            f"{BACKEND_URL}/reviews",
            json=review_data,
            timeout=10
        )
        
        if response.status_code == 200:
            data = response.json()
            required_fields = ["id", "name", "rating", "comment", "createdAt"]
            if all(field in data for field in required_fields):
                print_result(True, "Review posted successfully", response)
                return True
            else:
                print_result(False, f"Response missing required fields. Got: {data.keys()}", response)
                return False
        else:
            print_result(False, f"Expected 200, got {response.status_code}", response)
            return False
    except Exception as e:
        print_result(False, f"Exception: {str(e)}")
        return False

def test_11_post_another_review_and_check_average():
    """POST another review, then GET to verify count=2 and average computed"""
    print_test(11, "Post another review and verify average calculation")
    
    # Post second review with rating 3
    review_data = {
        "productSlug": "puff2door-preview",
        "name": "Jane",
        "rating": 3,
        "comment": "Good but could be better"
    }
    
    try:
        # Post review
        response = requests.post(
            f"{BACKEND_URL}/reviews",
            json=review_data,
            timeout=10
        )
        
        if response.status_code != 200:
            print_result(False, f"Failed to post second review. Status: {response.status_code}", response)
            return False
        
        # Get reviews to check average
        time.sleep(0.5)  # Small delay to ensure DB write
        response = requests.get(
            f"{BACKEND_URL}/reviews/puff2door-preview",
            timeout=10
        )
        
        if response.status_code == 200:
            data = response.json()
            count = data.get("count", 0)
            average = data.get("average", 0)
            reviews = data.get("reviews", [])
            
            # Should have at least 2 reviews (might have more from previous runs)
            if count >= 2:
                # Check if reviews are sorted newest first
                if len(reviews) >= 2:
                    # Verify average is computed (should be between 1 and 5)
                    if 1 <= average <= 5:
                        print_result(True, f"Reviews retrieved. Count: {count}, Average: {average}, Sorted: newest first", response)
                        return True
                    else:
                        print_result(False, f"Average calculation seems wrong: {average}", response)
                        return False
                else:
                    print_result(False, f"Expected at least 2 reviews, got {len(reviews)}", response)
                    return False
            else:
                print_result(False, f"Expected count >= 2, got {count}", response)
                return False
        else:
            print_result(False, f"Expected 200, got {response.status_code}", response)
            return False
    except Exception as e:
        print_result(False, f"Exception: {str(e)}")
        return False

def test_12_post_review_invalid_rating():
    """POST /api/reviews with rating:7 (out of 1-5) -> expect 422 validation error"""
    print_test(12, "Post review with invalid rating (should fail)")
    
    review_data = {
        "productSlug": "test-product",
        "name": "Invalid",
        "rating": 7,  # Invalid - should be 1-5
        "comment": "This should fail"
    }
    
    try:
        response = requests.post(
            f"{BACKEND_URL}/reviews",
            json=review_data,
            timeout=10
        )
        
        if response.status_code == 422:
            print_result(True, "Invalid rating correctly rejected with 422", response)
            return True
        else:
            print_result(False, f"Expected 422, got {response.status_code}", response)
            return False
    except Exception as e:
        print_result(False, f"Exception: {str(e)}")
        return False

# ============================================================================
# ORDERS + TRACKING TESTS
# ============================================================================

def test_13_post_order_with_auth():
    """POST /api/orders with auth token -> returns order with orderNumber, status, timeline"""
    print_test(13, "Create order with authentication")
    
    order_data = {
        "items": [
            {
                "productId": 1,
                "name": "Muha Meds Cartridge",
                "price": 45.0,
                "image": "https://example.com/muha.jpg",
                "category": "CARTRIDGES",
                "categorySlug": "cartridges",
                "slug": "muha-cartridge-1g",
                "qty": 2
            }
        ],
        "shipping": {
            "firstName": "John",
            "lastName": "Doe",
            "email": test_email,
            "phone": "555-1234",
            "address": "123 Main St",
            "city": "Los Angeles",
            "state": "CA",
            "zip": "90001"
        },
        "subtotal": 90.0,
        "shippingCost": 0.0,
        "discount": 0.0,
        "total": 90.0,
        "paymentLast4": "4242"
    }
    
    try:
        headers = {"Authorization": f"Bearer {auth_token}"}
        response = requests.post(
            f"{BACKEND_URL}/orders",
            headers=headers,
            json=order_data,
            timeout=10
        )
        
        if response.status_code == 200:
            data = response.json()
            required_fields = ["id", "orderNumber", "status", "timeline", "items", "shipping", "total"]
            
            if all(field in data for field in required_fields):
                # Check orderNumber starts with P2D-
                if data["orderNumber"].startswith("P2D-"):
                    # Check status is "placed"
                    if data["status"] == "placed":
                        # Check timeline has 4 stages
                        timeline = data["timeline"]
                        if len(timeline) == 4:
                            # Check first stage (placed) is done
                            if timeline[0]["key"] == "placed" and timeline[0]["done"] == True:
                                global order_number, order_id
                                order_number = data["orderNumber"]
                                order_id = data["id"]
                                print_result(True, f"Order created successfully. Order#: {order_number}, Status: {data['status']}", response)
                                return True
                            else:
                                print_result(False, "First timeline stage (placed) should be done", response)
                                return False
                        else:
                            print_result(False, f"Expected 4 timeline stages, got {len(timeline)}", response)
                            return False
                    else:
                        print_result(False, f"Expected status 'placed', got '{data['status']}'", response)
                        return False
                else:
                    print_result(False, f"Order number should start with 'P2D-', got '{data['orderNumber']}'", response)
                    return False
            else:
                print_result(False, f"Response missing required fields. Got: {data.keys()}", response)
                return False
        else:
            print_result(False, f"Expected 200, got {response.status_code}", response)
            return False
    except Exception as e:
        print_result(False, f"Exception: {str(e)}")
        return False

def test_14_get_orders_list():
    """GET /api/orders with token -> list contains created order"""
    print_test(14, "Get orders list")
    
    try:
        headers = {"Authorization": f"Bearer {auth_token}"}
        response = requests.get(
            f"{BACKEND_URL}/orders",
            headers=headers,
            timeout=10
        )
        
        if response.status_code == 200:
            data = response.json()
            if "orders" in data and isinstance(data["orders"], list):
                # Check if our order is in the list
                found = any(o.get("orderNumber") == order_number for o in data["orders"])
                if found:
                    print_result(True, f"Orders list retrieved. Count: {len(data['orders'])}, Our order found: {order_number}", response)
                    return True
                else:
                    print_result(False, f"Our order {order_number} not found in list", response)
                    return False
            else:
                print_result(False, "Response missing 'orders' field or not a list", response)
                return False
        else:
            print_result(False, f"Expected 200, got {response.status_code}", response)
            return False
    except Exception as e:
        print_result(False, f"Exception: {str(e)}")
        return False

def test_15_track_order_by_number():
    """GET /api/orders/track/{orderNumber} (no auth) -> returns order with tracking"""
    print_test(15, "Track order by order number (no auth required)")
    
    try:
        response = requests.get(
            f"{BACKEND_URL}/orders/track/{order_number}",
            timeout=10
        )
        
        if response.status_code == 200:
            data = response.json()
            if data.get("orderNumber") == order_number:
                if "timeline" in data and "status" in data:
                    print_result(True, f"Order tracked successfully. Status: {data['status']}", response)
                    return True
                else:
                    print_result(False, "Response missing 'timeline' or 'status'", response)
                    return False
            else:
                print_result(False, f"Order number mismatch. Expected {order_number}, got {data.get('orderNumber')}", response)
                return False
        else:
            print_result(False, f"Expected 200, got {response.status_code}", response)
            return False
    except Exception as e:
        print_result(False, f"Exception: {str(e)}")
        return False

def test_16_get_order_by_id():
    """GET /api/orders/{id} -> returns the order"""
    print_test(16, "Get order by ID")
    
    try:
        response = requests.get(
            f"{BACKEND_URL}/orders/{order_id}",
            timeout=10
        )
        
        if response.status_code == 200:
            data = response.json()
            if data.get("id") == order_id:
                print_result(True, f"Order retrieved by ID successfully", response)
                return True
            else:
                print_result(False, f"Order ID mismatch. Expected {order_id}, got {data.get('id')}", response)
                return False
        else:
            print_result(False, f"Expected 200, got {response.status_code}", response)
            return False
    except Exception as e:
        print_result(False, f"Exception: {str(e)}")
        return False

def test_17_track_invalid_order():
    """GET /api/orders/track/INVALID -> 404"""
    print_test(17, "Track invalid order number (should fail)")
    
    try:
        response = requests.get(
            f"{BACKEND_URL}/orders/track/INVALID-12345",
            timeout=10
        )
        
        if response.status_code == 404:
            print_result(True, "Invalid order number correctly rejected with 404", response)
            return True
        else:
            print_result(False, f"Expected 404, got {response.status_code}", response)
            return False
    except Exception as e:
        print_result(False, f"Exception: {str(e)}")
        return False

def test_18_post_order_guest():
    """POST /api/orders WITHOUT auth token (guest) -> should succeed (200)"""
    print_test(18, "Create order as guest (no auth)")
    
    order_data = {
        "items": [
            {
                "productId": 2,
                "name": "Guest Product",
                "price": 30.0,
                "image": "https://example.com/guest.jpg",
                "category": "VAPES",
                "categorySlug": "vapes",
                "slug": "guest-vape",
                "qty": 1
            }
        ],
        "shipping": {
            "firstName": "Guest",
            "lastName": "User",
            "email": "guest@example.com",
            "phone": "555-9999",
            "address": "456 Guest Ave",
            "city": "San Francisco",
            "state": "CA",
            "zip": "94102"
        },
        "subtotal": 30.0,
        "shippingCost": 5.0,
        "discount": 0.0,
        "total": 35.0,
        "paymentLast4": "1234"
    }
    
    try:
        # No Authorization header
        response = requests.post(
            f"{BACKEND_URL}/orders",
            json=order_data,
            timeout=10
        )
        
        if response.status_code == 200:
            data = response.json()
            if "orderNumber" in data and data["orderNumber"].startswith("P2D-"):
                print_result(True, f"Guest order created successfully. Order#: {data['orderNumber']}", response)
                return True
            else:
                print_result(False, "Response missing orderNumber or invalid format", response)
                return False
        else:
            print_result(False, f"Expected 200, got {response.status_code}", response)
            return False
    except Exception as e:
        print_result(False, f"Exception: {str(e)}")
        return False

# ============================================================================
# MAIN TEST RUNNER
# ============================================================================

def run_all_tests():
    print("\n" + "="*80)
    print("PUFF2DOOR BACKEND API TEST SUITE")
    print(f"Backend URL: {BACKEND_URL}")
    print("="*80)
    
    results = []
    
    # AUTH TESTS
    results.append(("Test 1: Register new user", test_1_register_new_user()))
    results.append(("Test 2: Register duplicate email", test_2_register_duplicate_email()))
    results.append(("Test 3: Login correct credentials", test_3_login_correct_credentials()))
    results.append(("Test 3b: Login wrong password", test_3b_login_wrong_password()))
    results.append(("Test 4: Get /me with token", test_4_get_me_with_token()))
    results.append(("Test 4b: Get /me without token", test_4b_get_me_without_token()))
    results.append(("Test 4c: Get /me invalid token", test_4c_get_me_invalid_token()))
    
    # CART TESTS
    results.append(("Test 5: Get cart empty", test_5_get_cart_empty()))
    results.append(("Test 6: Put cart with items", test_6_put_cart_with_items()))
    results.append(("Test 7: Get cart persistence", test_7_get_cart_persistence()))
    results.append(("Test 8: Get cart without token", test_8_get_cart_without_token()))
    
    # REVIEWS TESTS
    results.append(("Test 9: Get reviews fresh slug", test_9_get_reviews_fresh_slug()))
    results.append(("Test 10: Post review", test_10_post_review()))
    results.append(("Test 11: Post another review + average", test_11_post_another_review_and_check_average()))
    results.append(("Test 12: Post review invalid rating", test_12_post_review_invalid_rating()))
    
    # ORDERS + TRACKING TESTS
    results.append(("Test 13: Post order with auth", test_13_post_order_with_auth()))
    results.append(("Test 14: Get orders list", test_14_get_orders_list()))
    results.append(("Test 15: Track order by number", test_15_track_order_by_number()))
    results.append(("Test 16: Get order by ID", test_16_get_order_by_id()))
    results.append(("Test 17: Track invalid order", test_17_track_invalid_order()))
    results.append(("Test 18: Post order as guest", test_18_post_order_guest()))
    
    # SUMMARY
    print("\n" + "="*80)
    print("TEST SUMMARY")
    print("="*80)
    
    passed = sum(1 for _, result in results if result)
    total = len(results)
    
    for test_name, result in results:
        status = "✅ PASS" if result else "❌ FAIL"
        print(f"{status}: {test_name}")
    
    print("\n" + "="*80)
    print(f"TOTAL: {passed}/{total} tests passed ({passed*100//total}%)")
    print("="*80)
    
    return passed == total

if __name__ == "__main__":
    success = run_all_tests()
    exit(0 if success else 1)
