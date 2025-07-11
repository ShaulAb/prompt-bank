# Prompt Bank Sharing API - Testing Checklist

**Last Updated:** July 11, 2025  
**Project:** Prompt Bank VS Code Extension - Sharing Feature  
**GitHub Client ID:** Ov23lifTWGkzLh8Dp3ci  
**Supabase Project:** xlqtowactrzmslpkzliq  

---

## **Prerequisites**
- [ ] GitHub OAuth app created and configured
- [ ] Supabase project set up with sharing API
- [ ] Database schema deployed
- [ ] Edge functions deployed
- [ ] Domain `share.prestissimo.ai` configured (optional for testing)

---

## **1. Database & Schema Testing**

### **1.1 Database Structure**
- [x] `shares` table exists with correct schema
- [x] Primary key `id` is TEXT
- [x] `payload` column is BYTEA
- [x] `owner_github_id` column is BIGINT
- [x] `expires_at` column is TIMESTAMPTZ
- [x] `max_downloads` defaults to 25
- [x] `downloads` defaults to 0
- [x] `created_at` defaults to now()
- [x] Indexes exist on `expires_at` and `owner_github_id`
- [x] RLS policies are enabled and configured

### **1.2 Database Operations**
- [ ] Can insert test records manually
- [ ] Can query records by ID
- [ ] Can update download counter
- [ ] RLS policies work correctly

---

## **2. Edge Functions Testing**

### **2.1 create-share Function**
- [x] Function is deployed and accessible
- [⚠️] Returns 405 for non-POST requests (JWT check happens first)
- [x] Returns 401 without Authorization header
- [x] Returns 400 for missing payload
- [ ] Returns 400 for payload > 64KB
- [x] Returns 201 with valid request
- [x] Response includes `id`, `expiresAt`, and `url`
- [x] Creates record in database correctly
- [x] Handles GitHub user metadata correctly

### **2.2 get-share Function**
- [x] Function is deployed and accessible
- [⚠️] Returns 405 for non-GET requests (JWT verification issue)
- [x] Returns 404 for non-existent share ID
- [ ] Returns 410 for expired shares
- [ ] Returns 410 for download limit exceeded
- [x] Returns 200 with valid share
- [x] Response includes `id`, `payload`, `expiresAt`, `downloadsRemaining`
- [x] Increments download counter correctly
- [x] Payload is correctly base64 encoded

---

## **3. Authentication Testing**

### **3.1 GitHub OAuth Flow**
- [x] GitHub OAuth app redirects correctly
- [x] Callback URL works with Supabase
- [x] `vscode://promptbank.prompt-bank/auth` is whitelisted under Supabase **Redirect URLs**
- [x] GitHub OAuth *Authorization callback URL* is `https://<SUPABASE_URL>/auth/v1/callback`
- [x] Supabase returns `access_token` and `expires_in` in URL *fragment* (not query)
- [x] VS Code `UriHandler` receives callback URI and **parses fragment parameters**
- [x] AuthService saves token to SecretStorage and calculates correct `expiresAt`
- [x] Debug output channel logs: `handleUri` invocation, token length, expiry, and storage confirmation
- [x] JWT tokens are generated correctly
- [ ] User metadata includes GitHub ID
- [ ] Tokens can be used for API calls

### **3.2 Authentication Edge Cases**
- [ ] Invalid JWT tokens are rejected
- [ ] Expired JWT tokens are rejected
- [ ] Missing GitHub metadata is handled
- [ ] Non-GitHub auth providers are rejected

---

## **4. API Integration Testing**

### **4.1 End-to-End Flow**
- [x] Create share with valid auth → Success
- [x] Retrieve share immediately → Success
- [x] Retrieve share multiple times → Download counter increases
- [ ] Retrieve share after expiry → 410 error
- [ ] Retrieve share after download limit → 410 error

### **4.2 Payload Testing**
- [ ] Small payload (< 1KB) → Success
- [ ] Medium payload (32KB) → Success
- [ ] Large payload (63KB) → Success
- [ ] Oversized payload (65KB) → 400 error
- [ ] Empty payload → 400 error
- [ ] Invalid base64 payload → Handled gracefully

---

## **5. Security & Rate Limiting**

### **5.1 Security Tests**
- [ ] Cannot access shares without proper ID
- [ ] Cannot create shares without authentication
- [ ] GitHub user ID is correctly extracted
- [ ] Payload is stored securely (BYTEA)
- [ ] No sensitive data in error messages

### **5.2 Rate Limiting (Future)**
- [ ] Multiple rapid requests from same user
- [ ] Daily upload limit enforcement
- [ ] Abuse detection and prevention

---

## **6. Error Handling**

### **6.1 Expected Errors**
- [ ] 400: Missing payload
- [ ] 400: Payload too large
- [ ] 401: Missing authentication
- [ ] 401: Invalid authentication
- [ ] 404: Share not found
- [ ] 405: Method not allowed
- [ ] 410: Share expired
- [ ] 410: Download limit exceeded
- [ ] 500: Internal server error

### **6.2 Error Response Format**
- [ ] All errors return JSON format
- [ ] Error messages are user-friendly
- [ ] CORS headers are included
- [ ] Status codes are appropriate

---

## **7. Performance Testing**

### **7.1 Response Times**
- [ ] create-share responds < 2 seconds
- [ ] get-share responds < 1 second
- [ ] Database queries are optimized
- [ ] Edge function cold starts are reasonable

### **7.2 Concurrent Access**
- [ ] Multiple users can create shares simultaneously
- [ ] Multiple users can retrieve same share
- [ ] Download counter updates are atomic

---

## **8. Manual Testing Commands**

### **8.1 Authentication Test**
```bash
# Get JWT token from Supabase (manual process)
export JWT_TOKEN="your_jwt_token_here"
```

### **8.2 Create Share Test**
```bash
curl -X POST https://xlqtowactrzmslpkzliq.supabase.co/functions/v1/create-share \
  -H "Authorization: Bearer $JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"payload": "SGVsbG8gV29ybGQ="}'
```

### **8.3 Get Share Test**
```bash
curl https://xlqtowactrzmslpkzliq.supabase.co/functions/v1/get-share/SHARE_ID
```

### **8.4 Test Payload Generation**
```bash
# Create test payload
echo "Hello World" | base64
# Result: SGVsbG8gV29ybGQK
```

---

## **9. Integration with VS Code Extension**

### **9.1 Extension Commands (Future)**
- [ ] `Share selected prompts` command works
- [ ] `Import shared link` command works
- [ ] GitHub authentication in VS Code works
- [ ] URL copying to clipboard works
- [ ] Success/error notifications work

### **9.2 UI Enhancements**
- [x] After sharing, VS Code notification states "expires in 24h"

---

## **Test Results Log**

| Test | Status | Date | Notes |
|------|--------|------|-------|
| Database Schema | ✅ | 2025-07-11 | All tables, indexes, and RLS policies created correctly |
| create-share Function | ✅ | 2025-07-11 | Working correctly with JWT auth, validates payload, creates shares |
| get-share Function | ✅ | 2025-07-11 | Working correctly, returns payload, increments download counter |
| GitHub OAuth | ✅ | 2025-07-11 | JWT token obtained successfully, GitHub metadata extracted |
| End-to-End Flow | ✅ | 2025-07-11 | Complete flow working: create → retrieve → download counting |

**Legend:**
- ✅ Passed
- ❌ Failed
- ⏳ Pending
- ⚠️ Partial/Issues

---

## **Notes & Issues**

### **JWT Verification Issue**
- **Issue**: Supabase Edge Functions have `verify_jwt: true` by default, causing JWT verification to happen before our code runs
- **Impact**: Cannot test method validation (405 errors) or public access to get-share function
- **Workaround**: Need to either:
  1. Get a valid JWT token for testing
  2. Configure functions to allow public access for get-share
  3. Use Supabase service role key for testing

### **Test Payload**
- **Base64 test payload**: `VGVzdCBwYXlsb2FkCg==` (decodes to "Test payload")

*(Use this section to document any issues found, workarounds, or important observations during testing)* 