using ChatCompletionApi.Service;
using Microsoft.AspNetCore.Mvc;
using Microsoft.SemanticKernel;

namespace ChatCompletionApi.Controllers;

/// <summary>
/// チャット関連のAPIエンドポイントを提供します。
/// </summary>
[Route("api/[controller]")]
[ApiController]
public class ChatController : ControllerBase
{
    private readonly ChatCompletionService _chatCompletionService;

    /// <summary>
    /// ChatControllerの新しいインスタンスを初期化します。
    /// </summary>
    /// <param name="chatCompletionService">チャット完了サービス。</param>
    public ChatController(ChatCompletionService chatCompletionService)
    {
        _chatCompletionService = chatCompletionService;
    }

    /// <summary>
    /// チャットメッセージのコンテンツを取得します。
    /// </summary>
    /// <param name="request">チャットリクエスト。</param>
    /// <returns>チャットメッセージコンテンツのリスト。</returns>
    [HttpPost]
    [Produces("application/json")]
    public async Task<ActionResult<List<ChatMessageContent>>> Talk([FromBody] ChatCompletionService.ChatRequest request)
    {
        var result = await _chatCompletionService.GetChatMessageContentsAsync(request);
        return result.ToList();
    }
}
