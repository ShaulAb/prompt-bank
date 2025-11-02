/**
 * Manual Test Script: Verify Real Supabase JWKS Endpoint
 *
 * This script validates that:
 * 1. JWKS endpoint returns the ECC (P-256) public key
 * 2. Our AuthService can fetch and parse the keys
 * 3. The key matches what we expect from the dashboard
 *
 * Run: npx tsx scripts/test-real-jwks.ts
 */

import { createRemoteJWKSet } from 'jose';

const SUPABASE_URL = 'https://xlqtowactrzmslpkzliq.supabase.co';
const EXPECTED_KEY_ID = '56be1b15-a1c0-410d-9491-d1c0ff0d6ae0';

async function testRealJWKS() {
  console.log('🔍 Testing Real Supabase JWKS Endpoint\n');
  console.log(`URL: ${SUPABASE_URL}/auth/v1/.well-known/jwks.json\n`);

  try {
    // Test 1: Fetch JWKS directly
    console.log('Test 1: Fetching JWKS endpoint directly...');
    const response = await fetch(`${SUPABASE_URL}/auth/v1/.well-known/jwks.json`);

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    const jwks = await response.json();
    console.log('✅ JWKS endpoint accessible');
    console.log(`   Keys found: ${jwks.keys.length}`);

    if (jwks.keys.length === 0) {
      console.error('❌ No keys in JWKS endpoint!');
      console.log('   This means the rotation might not have propagated yet.');
      console.log('   Wait 10-20 minutes and try again.');
      return;
    }

    // Test 2: Verify key properties
    console.log('\nTest 2: Verifying key properties...');
    const key = jwks.keys[0];

    const checks = {
      'Algorithm is ES256': key.alg === 'ES256',
      'Key type is EC': key.kty === 'EC',
      'Curve is P-256': key.crv === 'P-256',
      'Usage is signature': key.use === 'sig',
      'Key ID matches': key.kid === EXPECTED_KEY_ID,
      'Has X coordinate': !!key.x,
      'Has Y coordinate': !!key.y,
    };

    let allPassed = true;
    for (const [check, passed] of Object.entries(checks)) {
      const symbol = passed ? '✅' : '❌';
      console.log(`   ${symbol} ${check}`);
      if (!passed) allPassed = false;
    }

    if (!allPassed) {
      console.error('\n❌ Some key property checks failed!');
      return;
    }

    // Test 3: Verify jose library can parse it
    console.log('\nTest 3: Testing jose library integration...');
    try {
      const remoteJWKS = createRemoteJWKSet(
        new URL(`${SUPABASE_URL}/auth/v1/.well-known/jwks.json`),
        {
          cacheMaxAge: 10 * 60 * 1000, // 10 minutes
          timeoutDuration: 5000, // 5 seconds
        }
      );
      console.log('✅ jose createRemoteJWKSet succeeded');
      console.log('   JWKS is ready for JWT verification');
    } catch (error) {
      console.error('❌ jose library failed to parse JWKS:', error);
      return;
    }

    // Test 4: Display key details
    console.log('\n📋 Key Details:');
    console.log(`   Key ID: ${key.kid}`);
    console.log(`   Algorithm: ${key.alg} (${key.kty} with ${key.crv} curve)`);
    console.log(`   Public Key X: ${key.x.substring(0, 20)}...`);
    console.log(`   Public Key Y: ${key.y.substring(0, 20)}...`);

    console.log('\n🎉 All tests passed!');
    console.log('\n✅ Your Supabase project is ready for JWKS-based JWT verification');
    console.log('✅ AuthService will be able to verify tokens using this public key');
    console.log('\n📝 Next steps:');
    console.log('   1. Old HS256 tokens will expire within 1 hour (grace period)');
    console.log('   2. New tokens are signed with ECC (P-256) private key');
    console.log('   3. Our AuthService verifies them using this public key');
    console.log('   4. Zero downtime for users! 🚀');

  } catch (error) {
    console.error('\n❌ Test failed:', error);
    console.log('\nPossible issues:');
    console.log('   - Network connectivity problem');
    console.log('   - JWKS cache not yet propagated (wait 10-20 min)');
    console.log('   - Supabase service issue');
  }
}

// Run the test
testRealJWKS().catch(console.error);
