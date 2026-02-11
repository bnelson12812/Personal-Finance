"""
Personal Finance Data Processor
Handles CSV imports from bank and credit card accounts
"""

import pandas as pd
import numpy as np
from datetime import datetime
from typing import List, Dict, Tuple
import re


class FinanceDataProcessor:
    """Process and analyze personal finance data from bank exports"""
    
    def __init__(self):
        self.debit_data = None
        self.credit_data = None
        self.combined_data = None
        
    def load_csv(self, filepath: str, account_type: str) -> pd.DataFrame:
        """
        Load CSV file from bank export
        
        Args:
            filepath: Path to CSV file
            account_type: 'debit' or 'credit'
        
        Returns:
            DataFrame with loaded data
        """
        df = pd.read_csv(filepath)
        
        # Convert Post Date to datetime
        df['Post Date'] = pd.to_datetime(df['Post Date'])
        
        # Add account type identifier
        df['Account Type'] = account_type
        
        # Fill NaN values in Debit and Credit columns with 0
        df['Debit'] = df['Debit'].fillna(0)
        df['Credit'] = df['Credit'].fillna(0)
        
        return df
    
    def identify_transfers(self, debit_df: pd.DataFrame, credit_df: pd.DataFrame) -> Tuple[pd.DataFrame, pd.DataFrame]:
        """
        Identify and mark credit card payments to avoid double-counting
        
        Looks for:
        - Credits on credit card account (payments received)
        - Debits on debit account with matching amounts on same/nearby dates
        
        Args:
            debit_df: Debit account transactions
            credit_df: Credit account transactions
        
        Returns:
            Tuple of (debit_df, credit_df) with 'Is_Transfer' column added
        """
        debit_df = debit_df.copy()
        credit_df = credit_df.copy()
        
        # Initialize transfer flag
        debit_df['Is_Transfer'] = False
        credit_df['Is_Transfer'] = False
        
        # Find credit card payments (credits on credit card)
        credit_payments = credit_df[credit_df['Credit'] > 0].copy()
        
        for idx, payment in credit_payments.iterrows():
            amount = payment['Credit']
            payment_date = payment['Post Date']
            
            # Look for matching debit within +/- 3 days
            date_window = pd.Timedelta(days=3)
            matching_debits = debit_df[
                (debit_df['Debit'] == amount) &
                (debit_df['Post Date'] >= payment_date - date_window) &
                (debit_df['Post Date'] <= payment_date + date_window) &
                (~debit_df['Is_Transfer'])  # Not already marked
            ]
            
            if len(matching_debits) > 0:
                # Mark both as transfers
                credit_df.loc[idx, 'Is_Transfer'] = True
                debit_df.loc[matching_debits.index[0], 'Is_Transfer'] = True
        
        return debit_df, credit_df
    
    def process_data(self, debit_filepath: str, credit_filepath: str) -> pd.DataFrame:
        """
        Main processing function - loads and combines data from both accounts
        
        Args:
            debit_filepath: Path to debit account CSV
            credit_filepath: Path to credit account CSV
        
        Returns:
            Combined DataFrame with all transactions
        """
        # Load both files
        self.debit_data = self.load_csv(debit_filepath, 'debit')
        self.credit_data = self.load_csv(credit_filepath, 'credit')
        
        # Identify transfers
        self.debit_data, self.credit_data = self.identify_transfers(
            self.debit_data, self.credit_data
        )
        
        # Combine datasets
        self.combined_data = pd.concat([self.debit_data, self.credit_data], ignore_index=True)
        
        # Sort by date
        self.combined_data = self.combined_data.sort_values('Post Date', ascending=False)
        
        # Calculate net amount (positive = income, negative = expense)
        self.combined_data['Net_Amount'] = self.combined_data['Credit'] - self.combined_data['Debit']
        
        # Clean up Classification
        self.combined_data['Classification'] = self.combined_data['Classification'].fillna('Uncategorized')
        
        return self.combined_data
    
    def get_monthly_summary(self, df: pd.DataFrame = None) -> pd.DataFrame:
        """
        Calculate monthly income and expenses
        
        Args:
            df: DataFrame to analyze (uses self.combined_data if None)
        
        Returns:
            DataFrame with monthly summaries
        """
        if df is None:
            df = self.combined_data
        
        # Exclude transfers
        df_no_transfers = df[~df['Is_Transfer']].copy()
        
        # Extract year-month
        df_no_transfers['Year_Month'] = df_no_transfers['Post Date'].dt.to_period('M')
        
        # Calculate monthly totals
        monthly = df_no_transfers.groupby('Year_Month').agg({
            'Debit': 'sum',  # Total expenses
            'Credit': 'sum',  # Total income
            'Net_Amount': 'sum'  # Net cash flow
        }).reset_index()
        
        monthly['Year_Month'] = monthly['Year_Month'].astype(str)
        monthly.columns = ['Month', 'Total_Expenses', 'Total_Income', 'Net_Cash_Flow']
        
        return monthly
    
    def get_category_breakdown(self, df: pd.DataFrame = None, month: str = None) -> pd.DataFrame:
        """
        Get spending breakdown by category
        
        Args:
            df: DataFrame to analyze (uses self.combined_data if None)
            month: Optional month filter (format: 'YYYY-MM')
        
        Returns:
            DataFrame with category spending
        """
        if df is None:
            df = self.combined_data
        
        # Exclude transfers and income
        df_expenses = df[(~df['Is_Transfer']) & (df['Debit'] > 0)].copy()
        
        # Filter by month if specified
        if month:
            df_expenses['Year_Month'] = df_expenses['Post Date'].dt.to_period('M').astype(str)
            df_expenses = df_expenses[df_expenses['Year_Month'] == month]
        
        # Group by category
        category_spend = df_expenses.groupby('Classification').agg({
            'Debit': 'sum',
            'Description': 'count'
        }).reset_index()
        
        category_spend.columns = ['Category', 'Total_Spent', 'Transaction_Count']
        category_spend = category_spend.sort_values('Total_Spent', ascending=False)
        
        return category_spend
    
    def get_account_comparison(self, df: pd.DataFrame = None) -> Dict:
        """
        Compare spending between debit and credit accounts
        
        Args:
            df: DataFrame to analyze (uses self.combined_data if None)
        
        Returns:
            Dictionary with account comparison metrics
        """
        if df is None:
            df = self.combined_data
        
        # Exclude transfers
        df_no_transfers = df[~df['Is_Transfer']].copy()
        
        # Debit account spending
        debit_expenses = df_no_transfers[
            (df_no_transfers['Account Type'] == 'debit') & 
            (df_no_transfers['Debit'] > 0)
        ]['Debit'].sum()
        
        # Credit account spending
        credit_expenses = df_no_transfers[
            (df_no_transfers['Account Type'] == 'credit') & 
            (df_no_transfers['Debit'] > 0)
        ]['Debit'].sum()
        
        return {
            'debit_spending': debit_expenses,
            'credit_spending': credit_expenses,
            'total_spending': debit_expenses + credit_expenses,
            'credit_percentage': (credit_expenses / (debit_expenses + credit_expenses) * 100) if (debit_expenses + credit_expenses) > 0 else 0
        }
    
    def get_transactions_by_merchant(self, df: pd.DataFrame = None, top_n: int = 10) -> pd.DataFrame:
        """
        Get top merchants by spending
        
        Args:
            df: DataFrame to analyze (uses self.combined_data if None)
            top_n: Number of top merchants to return
        
        Returns:
            DataFrame with top merchants
        """
        if df is None:
            df = self.combined_data
        
        # Exclude transfers and income
        df_expenses = df[(~df['Is_Transfer']) & (df['Debit'] > 0)].copy()
        
        # Group by merchant
        merchant_spend = df_expenses.groupby('Description').agg({
            'Debit': ['sum', 'count', 'mean']
        }).reset_index()
        
        merchant_spend.columns = ['Merchant', 'Total_Spent', 'Visit_Count', 'Avg_Transaction']
        merchant_spend = merchant_spend.sort_values('Total_Spent', ascending=False).head(top_n)
        
        return merchant_spend
