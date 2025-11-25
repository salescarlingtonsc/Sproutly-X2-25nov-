import React, { useState, useEffect } from 'react';

const DisclaimerTab = () => {
  const [hasAgreed, setHasAgreed] = useState(false);

  useEffect(() => {
    // Check if user has already agreed in this session
    const agreed = sessionStorage.getItem('disclaimer_agreed');
    if (agreed === 'true') {
      setHasAgreed(true);
    }
  }, []);

  useEffect(() => {
    if (hasAgreed) {
      sessionStorage.setItem('disclaimer_agreed', 'true');
    }
  }, [hasAgreed]);

  return (
    <div className="p-6 max-w-4xl mx-auto">
      {/* Simple Header */}
      <div className="bg-white border-2 border-gray-800 rounded-xl p-8 mb-8 text-center">
        <div className="text-5xl mb-4">📋</div>
        <h1 className="m-0 text-gray-800 text-2xl font-bold mb-3">
          Before You Begin
        </h1>
        <p className="m-0 text-gray-500 text-base leading-relaxed max-w-xl mx-auto">
          This is a planning tool to help you explore financial scenarios. Please take a moment to understand what it is—and what it isn't.
        </p>
      </div>

      {/* Main Disclaimer Content */}
      <div className="bg-white rounded-xl p-8 border-2 border-gray-200 mb-6">
        
        {/* What This Is */}
        <div className="mb-8">
          <h2 className="text-xl font-bold text-gray-800 mb-4">
            What This Tool Is
          </h2>
          <ul className="text-[15px] text-gray-700 leading-loose ml-5 list-disc">
            <li>An <strong>educational calculator</strong> to explore financial scenarios and understand how different decisions might impact your future</li>
            <li>A <strong>starting point</strong> for conversations with qualified financial advisers</li>
            <li>Based on <strong>simplified assumptions</strong> about CPF rates, investment returns, and life events that may not match reality</li>
          </ul>
        </div>

        {/* What This Isn't */}
        <div className="mb-8">
          <h2 className="text-xl font-bold text-gray-800 mb-4">
            What This Tool Isn't
          </h2>
          <ul className="text-[15px] text-gray-700 leading-loose ml-5 list-disc">
            <li><strong>For discussion purposes only</strong> — This is for discussion purposes and not financial advice. Only after a full fact find is done can we provide you the right advice based on your needs.</li>
            <li><strong>Not a guarantee</strong> — Projections are estimates based on assumptions that may change</li>
            <li><strong>Not a promise of results</strong> — Actual market performance, policy changes, and personal circumstances will differ</li>
          </ul>
        </div>

        {/* Important Points */}
        <div className="p-6 bg-gray-50 rounded-lg border-2 border-gray-300 mb-6">
          <h3 className="text-lg font-bold text-gray-800 mt-0 mb-4">
            Please Remember
          </h3>
          <div className="text-sm text-gray-700 leading-relaxed">
            <p className="mt-0 mb-3">
              <strong>Capital is non-guaranteed.</strong> Past performance doesn't guarantee future results. Investments carry risk, and capital may be lost.
            </p>
            <p className="mt-0 mb-3">
              <strong>Consult professionals.</strong> Before making any financial decisions, speak with licensed financial advisers, tax professionals, and legal advisors who can assess your specific situation.
            </p>
            <p className="mt-0 mb-0">
              <strong>You're responsible.</strong> Any decisions you make based on this tool are your own. We're not liable for any outcomes, losses, or damages.
            </p>
          </div>
        </div>

        {/* Agreement Checkbox */}
        <div className="p-6 bg-white rounded-lg border-2 border-gray-800">
          <label className="flex gap-4 cursor-pointer items-start">
            <input
              type="checkbox"
              checked={hasAgreed}
              onChange={(e) => setHasAgreed(e.target.checked)}
              className="w-6 h-6 cursor-pointer flex-shrink-0 mt-0.5"
            />
            <div className="flex-1">
              <div className="text-base font-semibold text-gray-800 mb-2">
                I understand and agree
              </div>
              <div className="text-sm text-gray-600 leading-relaxed">
                I acknowledge this is an educational tool, not financial advice. I'll consult licensed professionals before making financial decisions. 
                I understand capital is non-guaranteed and I'm responsible for verifying information and any decisions I make. 
                The developers have no liability for outcomes or losses.
              </div>
            </div>
          </label>
        </div>
      </div>

      {/* Status Message */}
      {hasAgreed ? (
        <div className="p-6 bg-white rounded-xl border-2 border-gray-800 text-center">
          <div className="text-4xl mb-3">✓</div>
          <p className="m-0 text-lg text-gray-800 font-semibold mb-2">
            Ready to start
          </p>
          <p className="m-0 text-[15px] text-gray-500">
            Head to the <strong>Profile</strong> tab to begin your financial planning
          </p>
        </div>
      ) : (
        <div className="p-6 bg-white rounded-xl border-2 border-gray-300 text-center">
          <div className="text-4xl mb-3">📝</div>
          <p className="m-0 text-base text-gray-600">
            Please read and check the box above to continue
          </p>
        </div>
      )}

      {/* Footer */}
      <div className="mt-6 p-4 text-center text-xs text-gray-400">
        <p className="m-0">
          Last Updated: November 15, 2025 | Sproutly.Asia - Financial Planning Made Simple
        </p>
      </div>
    </div>
  );
};

export default DisclaimerTab;