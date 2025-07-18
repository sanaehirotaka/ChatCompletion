using System.ComponentModel.DataAnnotations;
using Microsoft.SemanticKernel;
using Microsoft.SemanticKernel.ChatCompletion;
using Microsoft.SemanticKernel.Connectors.Google;

namespace ChatCompletionApi.Service;

/// <summary>
/// チャット補完サービスを提供します。
/// Geminiモデルを使用してチャットの対話を行います。
/// </summary>
public class ChatCompletionService
{
    /// <summary>
    /// 使用するGeminiモデルの名前。
    /// </summary>
    private readonly string modelName;
    /// <summary>
    /// Gemini APIキーのリスト。
    /// </summary>
    private readonly string[] apiKeys;
    /// <summary>
    /// チャット補完の最大再試行回数。
    /// </summary>
    private readonly int _maxRetries;

    /// <summary>
    /// ChatCompletionServiceの新しいインスタンスを初期化します。
    /// </summary>
    /// <param name="logger">ロガーインスタンス。</param>
    public ChatCompletionService()
    {
        modelName = Environment.GetEnvironmentVariable("GEMINI_MODEL_NAME")
            ?? throw new InvalidOperationException("GEMINI_MODEL_NAME environment variable is not set.");

        var apiKey = Environment.GetEnvironmentVariable("GEMINI_API_KEYS")
            ?? throw new InvalidOperationException("GEMINI_API_KEYS environment variable is not set.");
        apiKeys = apiKey.Split(',', ';', '|');

        _maxRetries = int.TryParse(Environment.GetEnvironmentVariable("CHAT_COMPLETION_MAX_RETRIES"), out var retries) ? retries : 3;
    }

    /// <summary>
    /// 指定されたチャットリクエストに基づいてチャットの対話を行います。
    /// </summary>
    /// <param name="request">チャットリクエスト。</param>
    /// <returns>チャットメッセージコンテンツのリスト。</returns>
    /// <exception cref="InvalidOperationException">複数回の再試行後もチャットが完了しなかった場合。</exception>
    public async Task<List<ChatMessageContent>> GetChatMessageContentsAsync(ChatRequest request)
    {
        var apiKeyIndex = Random.Shared.Next() % apiKeys.Length;

        for (var i = 0; i < _maxRetries; i++)
        {
            try
            {
                var builder = Kernel.CreateBuilder();
                builder.AddGoogleAIGeminiChatCompletion(
                    modelId: request.ModelName ?? modelName,
                    apiKey: apiKeys[(apiKeyIndex + i) % apiKeys.Length]
                );
                var kernel = builder.Build();

                var chatCompletionService = kernel.GetRequiredService<IChatCompletionService>();

                var history = request.History;
                var executionSettings = request.PromptExecutionSettings ?? GetDefaultExecuteSettings();
                List<ChatMessageContent> result = [.. await chatCompletionService.GetChatMessageContentsAsync(history, executionSettings, kernel)];

                if (result.Any(contents => !string.IsNullOrEmpty(contents.Content)))
                {
                    return result;
                }
            }
            catch (Exception ex)
            {
                if (i == _maxRetries - 1) // Last attempt
                {
                    throw new InvalidOperationException("Failed to complete chat after multiple retries.", ex);
                }
            }
        }
        // この行は、ループが常に最後の試行で例外をスローする場合、到達しないはずです。
        // ただし、コンパイラを満たすために、汎用例外をスローするか、最後の例外を再スローできます。
        throw new InvalidOperationException("予期せぬエラー: チャット補完ループが成功または再スローせずに終了しました。");
    }

    /// <summary>
    /// デフォルトのGeminiプロンプト実行設定を取得します。
    /// </summary>
    /// <returns>GeminiPromptExecutionSettingsのインスタンス。</returns>
    private GeminiPromptExecutionSettings GetDefaultExecuteSettings()
    {
        return new GeminiPromptExecutionSettings()
        {
            SafetySettings = [
                new (GeminiSafetyCategory.Harassment, GeminiSafetyThreshold.BlockNone),
                new (GeminiSafetyCategory.DangerousContent, GeminiSafetyThreshold.BlockNone),
                new (GeminiSafetyCategory.SexuallyExplicit, GeminiSafetyThreshold.BlockNone)
            ],
            ThinkingConfig = new()
            {
                ThinkingBudget = 6144
            }
        };
    }

    /// <summary>
    /// チャットリクエストを表すクラス。
    /// </summary>
    public class ChatRequest
    {
        /// <summary>
        /// 使用するGeminiモデルの名前
        /// </summary>
        public string? ModelName { get; set; }

        /// <summary>
        /// チャット履歴。
        /// </summary>
        [Required]
        public ChatHistory History { get; set; } = default!;

        /// <summary>
        /// プロンプト実行設定。
        /// </summary>
        public GeminiPromptExecutionSettings? PromptExecutionSettings { get; set; }
    }
}
